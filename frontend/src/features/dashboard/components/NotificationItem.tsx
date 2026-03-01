import { Notification, SEVERITY_COLORS } from '@/types/notification'
import { formatDate } from '@/utils/formatters'
import { cn } from '@/utils/cn'

interface NotificationItemProps {
  notification: Notification
  onClick?: (notification: Notification) => void
}

/**
 * 通知项组件
 * 展示单个通知的详细信息，包括状态指示点、标题、内容和时间
 */
export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { title, content, timestamp, read, severity = 'info', type } = notification

  // 获取严重级别对应的颜色
  const severityColor = SEVERITY_COLORS[severity]

  // 系统通知使用紫色指示点
  const indicatorColor = type === 'system' ? 'bg-purple-500' : severityColor

  return (
    <div
      onClick={() => onClick?.(notification)}
      className={cn(
        'flex items-start gap-3 p-4 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0',
        'hover:bg-muted/40/50',
        !read && 'bg-blue-50/50 dark:bg-blue-900/10'
      )}
    >
      {/* 状态指示点 */}
      <div className="flex-shrink-0 mt-1.5">
        <div className={cn('w-2 h-2 rounded-full', indicatorColor)} />
      </div>

      {/* 通知内容 */}
      <div className="flex-1 min-w-0">
        {/* 标题 */}
        <div className={cn('text-sm font-medium mb-1', read ? 'text-muted-foreground' : 'text-foreground')}>
          {title}
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
    </div>
  )
}
