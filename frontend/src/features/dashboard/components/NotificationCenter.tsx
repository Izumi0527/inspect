'use client'

import { useEffect, useMemo, useState } from 'react'
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
  NOTIFICATION_CATEGORIES,
} from '@/types/notification'
import { cn } from '@/utils/cn'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import {
  DashboardNotificationsResult,
  dismissDashboardNotifications,
  fetchDashboardNotificationsWithMeta,
  markDashboardNotificationsRead,
} from '../api/dashboard.api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

interface NotificationCenterProps {
  /** 告警数量（显示在徽章上） */
  alertCount?: number
  /** 点击"查看全部通知"的回调 */
  onViewAll?: () => void
}

/**
 * 通知中心组件
 * 包含通知列表、标签页切换、已读管理等完整功能
 */
export function NotificationCenter({ alertCount: _alertCount, onViewAll }: NotificationCenterProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState<NotificationCategoryKey>('all')
  const canReadAlerts = usePermission(Permission.ALERTS_READ)

  useEffect(() => {
    // 无告警权限时，不允许停留在“告警”标签页（避免空白/误导交互）
    if (!canReadAlerts && activeCategory === 'alerts') {
      setActiveCategory('all')
    }
  }, [activeCategory, canReadAlerts])

  const limit = 20
  const windowLimit = 200
  const queryKey = ['dashboardNotifications', limit] as const

  const {
    data,
    isLoading,
  } = useQuery<DashboardNotificationsResult>({
    queryKey,
    queryFn: () => fetchDashboardNotificationsWithMeta(limit),
    refetchInterval: 30_000,
  })

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? notifications.filter((n) => !n.read).length

  const updateCache = (updater: (prev: DashboardNotificationsResult | undefined) => DashboardNotificationsResult | undefined) => {
    queryClient.setQueryData(queryKey, (prev: DashboardNotificationsResult | undefined) => updater(prev))
  }

  const markReadMutation = useMutation({
    mutationFn: (payload: Parameters<typeof markDashboardNotificationsRead>[0]) =>
      markDashboardNotificationsRead(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<DashboardNotificationsResult>(queryKey)
      if (!previous) {
        return { previous }
      }

      updateCache((prev) => {
        if (!prev) return prev

        const isAll = 'all' in payload && payload.all
        const ids = 'ids' in payload ? payload.ids : []

        const nextNotifications = isAll
          ? prev.notifications.map((n) => ({ ...n, read: true }))
          : prev.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))

        return {
          ...prev,
          notifications: nextNotifications,
          unreadCount: nextNotifications.filter((n) => !n.read).length,
        }
      })

      return { previous }
    },
    onError: (error, _payload, context) => {
      console.error('标记已读失败:', error)
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error('标记已读失败，请稍后重试')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (payload: Parameters<typeof dismissDashboardNotifications>[0]) =>
      dismissDashboardNotifications(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<DashboardNotificationsResult>(queryKey)
      if (!previous) {
        return { previous }
      }

      updateCache((prev) => {
        if (!prev) return prev

        const isAll = 'all' in payload && payload.all
        if (isAll) {
          return {
            ...prev,
            notifications: [],
            unreadCount: 0,
          }
        }

        const ids = 'ids' in payload ? payload.ids : []
        const nextNotifications = prev.notifications.filter((n) => !ids.includes(n.id))
        return {
          ...prev,
          notifications: nextNotifications,
          unreadCount: nextNotifications.filter((n) => !n.read).length,
        }
      })

      return { previous }
    },
    onError: (error, _payload, context) => {
      console.error('清空通知失败:', error)
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error('清空失败，请稍后重试')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // 根据当前标签筛选通知
  const filteredNotifications = useMemo(() => {
    let filtered = notifications

    if (activeCategory === 'alerts') {
      filtered = notifications.filter((n) => n.type === 'alert')
    } else if (activeCategory === 'system') {
      filtered = notifications.filter((n) => n.type === 'system')
    }

    return filtered
  }, [notifications, activeCategory])

  // 处理通知点击
  const handleNotificationClick = (notification: Notification) => {
    markReadMutation.mutate({ ids: [notification.id] })

    if (notification.link) {
      if (!canReadAlerts && notification.link.startsWith('/alerts')) {
        toast.error(`当前账号缺少查看告警权限（${Permission.ALERTS_READ}）`)
        return
      }
      router.push(notification.link)
      return
    }

    // 根据通知类型处理跳转
    if (notification.type === 'alert') {
      if (!canReadAlerts) {
        toast.error(`当前账号缺少查看告警权限（${Permission.ALERTS_READ}）`)
        return
      }
      // 告警类型：跳转到告警中心并传递告警 ID
      router.push(`/alerts?id=${notification.id}`)
    }
  }

  const availableCategories = useMemo(() => {
    if (canReadAlerts) return NOTIFICATION_CATEGORIES
    return NOTIFICATION_CATEGORIES.filter((c) => c.key !== 'alerts')
  }, [canReadAlerts])

  const showViewAll = typeof onViewAll === 'function' && canReadAlerts

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
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
              onClick={() => markReadMutation.mutate({ all: true, window_limit: windowLimit })}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              全部已读
            </button>
            <span className="text-gray-300 dark:text-muted-foreground">|</span>
            <button
              onClick={() => dismissMutation.mutate({ all: true, window_limit: windowLimit })}
              className="text-sm text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              清空
            </button>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center border-b border-border">
          {availableCategories.map((category) => {
            const isActive = activeCategory === category.key
            const count =
              category.key === 'all'
                ? notifications.length
                : category.key === 'alerts'
                ? notifications.filter((n) => n.type === 'alert').length
                : notifications.filter((n) => n.type === 'system').length

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
                {count > 0 && (
                  <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({count})</span>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>

        {/* 通知列表 */}
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">加载中...</div>
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => (
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
        {showViewAll && filteredNotifications.length > 0 && (
          <div className="border-t border-border">
            <button
              onClick={onViewAll}
              className="w-full py-3 text-center text-sm text-blue-600 dark:text-blue-400 hover:bg-muted/40/50 transition-colors"
            >
              查看全部通知
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
