'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/atoms/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/atoms/dropdown-menu'
import { NotificationItem } from './NotificationItem'
import {
  Notification,
  NotificationCategoryKey,
  NotificationType,
  NOTIFICATION_CATEGORIES,
} from '@/types/notification'
import { cn } from '@/utils/cn'
import { useAuth, usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import {
  DashboardNotificationActionPayload,
  DashboardNotificationsResult,
  dismissDashboardNotifications,
  fetchDashboardNotificationsWithMeta,
  markDashboardNotificationsRead,
} from '../api/dashboard.api'
import { useDashboardAlertRealtimeRefresh } from '../hooks/useDashboard'
import { QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

interface NotificationCenterProps {
  /** 告警数量（显示在徽章上） */
  alertCount?: number
  /** 点击"前往告警中心"的回调 */
  onViewAll?: () => void
}

const LIMIT = 20
const WINDOW_LIMIT = 200

const categoryType = (key: NotificationCategoryKey): NotificationType | undefined =>
  NOTIFICATION_CATEGORIES.find((category) => category.key === key)?.type

type OptimisticContext = {
  previous: Array<[QueryKey, DashboardNotificationsResult | undefined]>
}

// 乐观更新：ids 只作用于指定项；all 作用于 type 作用域内（未带 type 则全部）的所有项
const applyOptimisticAction = (
  prev: DashboardNotificationsResult,
  payload: DashboardNotificationActionPayload,
  action: 'read' | 'dismiss'
): DashboardNotificationsResult => {
  const matches = (n: Notification) =>
    'ids' in payload ? payload.ids.includes(n.id) : !payload.type || n.type === payload.type

  const nextNotifications =
    action === 'read'
      ? prev.notifications.map((n) => (matches(n) ? { ...n, read: true } : n))
      : prev.notifications.filter((n) => !matches(n))

  return {
    ...prev,
    notifications: nextNotifications,
    unreadCount: nextNotifications.filter((n) => !n.read).length,
  }
}

/**
 * 通知中心组件
 * 包含通知列表、标签页切换、已读管理等完整功能
 */
export function NotificationCenter({ alertCount: _alertCount, onViewAll }: NotificationCenterProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<NotificationCategoryKey>('all')
  const { user } = useAuth()
  const canReadAlerts = usePermission(Permission.ALERTS_READ)

  useEffect(() => {
    // 无告警权限时，不允许停留在“告警”标签页（避免空白/误导交互）
    if (!canReadAlerts && activeCategory === 'alerts') {
      setActiveCategory('all')
    }
  }, [activeCategory, canReadAlerts])

  const notificationOwner = user?.id?.trim() || 'anonymous'
  const ownerQueryKey = ['dashboardNotifications', notificationOwner] as const
  const queryKeyFor = (category: NotificationCategoryKey) => [...ownerQueryKey, LIMIT, category] as const

  // “全部”查询常驻：驱动铃铛徽章的未读数，60s 拉一次足够；标签页隐藏时停止轮询
  const allQuery = useQuery<DashboardNotificationsResult>({
    queryKey: queryKeyFor('all'),
    queryFn: () => fetchDashboardNotificationsWithMeta(LIMIT),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  // 告警 / 消息标签页各自按 type 向后端拉取：后端各源合并后只截前 20 条，
  // 告警量占优时窗口里根本没有系统消息，前端二次过滤会让“消息”页恒空
  const activeType = categoryType(activeCategory)
  const categoryQuery = useQuery<DashboardNotificationsResult>({
    queryKey: queryKeyFor(activeCategory),
    queryFn: () => fetchDashboardNotificationsWithMeta(LIMIT, activeType),
    enabled: open && activeCategory !== 'all',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  const listQuery = activeCategory === 'all' ? allQuery : categoryQuery
  const notifications = listQuery.data?.notifications ?? []
  const unreadCount = allQuery.data?.unreadCount ?? 0

  const invalidateNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: ownerQueryKey })
  }

  // 告警新增/处理/解决推送后立即刷新徽章与列表，不必等 60s 轮询
  useDashboardAlertRealtimeRefresh(invalidateNotifications, canReadAlerts)

  const applyOptimistic = async (
    payload: DashboardNotificationActionPayload,
    action: 'read' | 'dismiss'
  ): Promise<OptimisticContext> => {
    await queryClient.cancelQueries({ queryKey: ownerQueryKey })
    const previous = queryClient.getQueriesData<DashboardNotificationsResult>({ queryKey: ownerQueryKey })
    queryClient.setQueriesData<DashboardNotificationsResult>({ queryKey: ownerQueryKey }, (prev) =>
      prev ? applyOptimisticAction(prev, payload, action) : prev
    )
    return { previous }
  }

  const rollbackOptimistic = (context: OptimisticContext | undefined) => {
    context?.previous.forEach(([key, data]) => {
      queryClient.setQueryData(key, data)
    })
  }

  const markReadMutation = useMutation({
    mutationFn: (payload: DashboardNotificationActionPayload) => markDashboardNotificationsRead(payload),
    onMutate: (payload) => applyOptimistic(payload, 'read'),
    onError: (error, _payload, context) => {
      console.error('标记已读失败:', error)
      rollbackOptimistic(context)
      toast.error('标记已读失败，请稍后重试')
    },
    onSettled: invalidateNotifications,
  })

  const dismissMutation = useMutation({
    mutationFn: (payload: DashboardNotificationActionPayload) => dismissDashboardNotifications(payload),
    onMutate: (payload) => applyOptimistic(payload, 'dismiss'),
    onError: (error, _payload, context) => {
      console.error('清空通知失败:', error)
      rollbackOptimistic(context)
      toast.error('清空失败，请稍后重试')
    },
    onSettled: invalidateNotifications,
  })

  const disableBulkActions =
    listQuery.isLoading ||
    listQuery.isError ||
    markReadMutation.isPending ||
    dismissMutation.isPending

  const bulkPayload = (): DashboardNotificationActionPayload =>
    activeType
      ? { all: true, window_limit: WINDOW_LIMIT, type: activeType }
      : { all: true, window_limit: WINDOW_LIMIT }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markReadMutation.mutate({ ids: [notification.id] })
    }
    if (!notification.link) return

    if (!canReadAlerts && notification.link.startsWith('/alerts')) {
      toast.error(`当前账号缺少查看告警权限（${Permission.ALERTS_READ}）`)
      return
    }
    setOpen(false)
    router.push(notification.link)
  }

  const availableCategories = canReadAlerts
    ? NOTIFICATION_CATEGORIES
    : NOTIFICATION_CATEGORIES.filter((c) => c.key !== 'alerts')

  const showViewAll = typeof onViewAll === 'function' && canReadAlerts && activeCategory !== 'system'

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `通知中心，${unreadCount} 条未读通知` : '通知中心'}
          title="通知中心"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[400px] max-h-[600px] p-0 overflow-hidden"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">通知中心</h3>
          <div className="flex items-center gap-2">
            <button
              disabled={disableBulkActions}
              onClick={() => markReadMutation.mutate(bulkPayload())}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              全部已读
            </button>
            <span className="text-gray-300 dark:text-muted-foreground">|</span>
            <button
              disabled={disableBulkActions}
              onClick={() => dismissMutation.mutate(bulkPayload())}
              className="text-sm text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              清空
            </button>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center border-b border-border">
          {availableCategories.map((category) => {
            const isActive = activeCategory === category.key

            return (
              <button
                key={category.key}
                onClick={() => setActiveCategory(category.key)}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors relative',
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {category.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>

        {/* 通知列表 */}
        <div className="max-h-[400px] overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">加载中...</div>
          ) : listQuery.isError ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-gray-500 dark:text-gray-400">
              <ShieldCheck className="w-12 h-12 mb-3 text-amber-400 dark:text-amber-500" />
              <p className="text-sm font-medium text-foreground">通知加载失败</p>
              <p className="mt-2 text-sm text-muted-foreground">
                当前无法获取最新通知，请检查网络或稍后重试。
              </p>
              {listQuery.error instanceof Error && listQuery.error.message.trim() !== '' && (
                <p className="mt-2 text-xs text-muted-foreground/80">{listQuery.error.message}</p>
              )}
              <button
                onClick={() => void listQuery.refetch()}
                className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/40 transition-colors"
                aria-label="重试加载通知"
              >
                重试
              </button>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={handleNotificationClick}
              />
            ))
          ) : (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <ShieldCheck className="w-12 h-12 mb-3 text-gray-300 dark:text-muted-foreground" />
              <p className="text-sm">暂无最近{activeCategory === 'alerts' ? '告警' : activeCategory === 'system' ? '系统通知' : '通知'}</p>
            </div>
          )}
        </div>

        {/* 底部链接 */}
        {showViewAll && notifications.length > 0 && (
          <div className="border-t border-border">
            <button
              onClick={() => {
                setOpen(false)
                onViewAll()
              }}
              className="w-full py-3 text-center text-sm text-blue-600 dark:text-blue-400 hover:bg-muted/40/50 transition-colors"
            >
              前往告警中心
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
