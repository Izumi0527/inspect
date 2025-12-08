import { memo, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface MonitoringSectionHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

/**
 * 监控区域标题组件
 *
 * 用于各个监控区域的标题栏
 *
 * 使用 React.memo 优化性能,避免不必要的重渲染
 */
export const MonitoringSectionHeader = memo(function MonitoringSectionHeader({
  title,
  subtitle,
  action,
  className,
}: MonitoringSectionHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-center justify-between', className)}>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
})
