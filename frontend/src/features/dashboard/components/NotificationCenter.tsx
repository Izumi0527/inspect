'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { fetchDashboardNotifications } from '../api/dashboard.api'

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
  const [activeCategory, setActiveCategory] = useState<NotificationCategoryKey>('all')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  // 从 localStorage 加载已读状态
  useEffect(() => {
    const stored = localStorage.getItem('notification_read_ids')
    if (stored) {
      try {
        const ids = JSON.parse(stored)
        setReadNotifications(new Set(ids))
      } catch (e) {
        console.error('Failed to parse read notifications:', e)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const items = await fetchDashboardNotifications(20)
      if (cancelled) return
      setNotifications(items)
      setLoading(false)
    }

    load().catch((e) => {
      console.error('加载通知失败:', e)
      if (cancelled) return
      setNotifications([])
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  // 标记通知为已读
  const markAsRead = (notificationId: string) => {
    const newReadIds = new Set(readNotifications)
    newReadIds.add(notificationId)
    setReadNotifications(newReadIds)
    localStorage.setItem('notification_read_ids', JSON.stringify(Array.from(newReadIds)))
  }

  // 标记全部为已读
  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id)
    const newReadIds = new Set(allIds)
    setReadNotifications(newReadIds)
    localStorage.setItem('notification_read_ids', JSON.stringify(allIds))
  }

  // 清空所有通知
  const clearAll = () => {
    setNotifications([])
    setReadNotifications(new Set())
    localStorage.removeItem('notification_read_ids')
  }

  // 根据当前标签筛选通知
  const filteredNotifications = useMemo(() => {
    let filtered = notifications

    if (activeCategory === 'alerts') {
      filtered = notifications.filter((n) => n.type === 'alert')
    } else if (activeCategory === 'system') {
      filtered = notifications.filter((n) => n.type === 'system')
    }

    // 添加已读状态
    return filtered.map((n) => ({
      ...n,
      read: readNotifications.has(n.id),
    }))
  }, [notifications, activeCategory, readNotifications])

  // 计算未读数量
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readNotifications.has(n.id)).length
  }, [notifications, readNotifications])

  // 处理通知点击
  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    if (notification.link) {
      router.push(notification.link)
      return
    }

    // 根据通知类型处理跳转
    if (notification.type === 'alert') {
      // 告警类型：跳转到告警中心并传递告警 ID
      router.push(`/alerts?id=${notification.id}`)
    }
  }

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">通知中心</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              全部已读
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              onClick={clearAll}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              清空
            </button>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
          {NOTIFICATION_CATEGORIES.map((category) => {
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
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
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
          {loading ? (
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
              <ShieldCheck className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">暂无最近{activeCategory === 'alerts' ? '告警' : activeCategory === 'system' ? '系统通知' : '通知'}</p>
            </div>
          )}
        </div>

        {/* 底部链接 */}
        {filteredNotifications.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onViewAll}
              className="w-full py-3 text-center text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              查看全部通知
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
