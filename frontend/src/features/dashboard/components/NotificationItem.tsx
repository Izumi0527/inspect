import { Notification, NotificationAlertStatus, SEVERITY_COLORS } from '@/types/notification'
import { formatDate } from '@/utils/formatters'
import { cn } from '@/utils/cn'

interface NotificationItemProps {
  notification: Notification
  onClick?: (notification: Notification) => void
}

// 活跃告警不加标签（默认态）；已确认/已解决是需要用户一眼分辨的处理状态
const ALERT_STATUS_LABELS: Partial<Record<NotificationAlertStatus, string>> = {
  acknowledged: '已确认',
  resolved: '已解决',
}

/**
 * 通知项组件
 * 展示单个通知的详细信息，包括状态指示点、标题、内容和时间
 */
export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { title, content, timestamp, read, severity = 'info', type, status } = notification

  // 获取严重级别对应的颜色
  const severityColor = SEVERITY_COLORS[severity]

  // 系统通知使用紫色指示点；已解决的告警不再按严重级别着色，避免与活跃告警混淆
  const indicatorColor =
    type === 'system' ? 'bg-purple-500' : status === 'resolved' ? 'bg-gray-400 dark:bg-gray-500' : severityColor
  const statusLabel = type === 'alert' && status ? ALERT_STATUS_LABELS[status] : undefined

  return (
    <button
      type="button"
      onClick={() => onClick?.(notification)}
      className={cn(
        'flex w-full items-start gap-3 p-4 text-left cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0',
        'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none',
        !read && 'bg-blue-50/50 dark:bg-blue-900/10'
      )}
    >
      {/* 状态指示点 */}
      <div className="flex-shrink-0 mt-1.5">
        <div data-testid="notification-indicator" className={cn('w-2 h-2 rounded-full', indicatorColor)} />
      </div>

      {/* 通知内容 */}
      <div className="flex-1 min-w-0">
        {/* 标题 + 告警处理状态 */}
        <div className={cn('flex items-center gap-2 text-sm font-medium mb-1', read ? 'text-muted-foreground' : 'text-foreground')}>
          <span className="truncate">{title}</span>
          {statusLabel && (
            <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal leading-none bg-muted text-muted-foreground">
              {statusLabel}
            </span>
          )}
        </div>

        {/* 内容 */}
        <div className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
          {content}
        </div>

        {/* 时间戳 */}
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {formatDate(timestamp, 'relative')}
        </div>
      </div>

      {/* 未读标识（可选） */}
      {!read && (
        <div className="flex-shrink-0">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
        </div>
      )}
    </button>
  )
}
