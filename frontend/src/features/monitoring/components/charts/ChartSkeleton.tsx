import { cn } from '@/utils/cn'

interface ChartSkeletonProps {
  /**
   * 骨架屏高度
   */
  height?: number

  /**
   * 自定义类名
   */
  className?: string

  /**
   * 是否显示标题骨架
   */
  showTitle?: boolean
}

/**
 * 图表加���骨架屏组件
 *
 * @description
 * 在图表懒加载时显示的占位组件,提升用户体验
 * 使用脉冲动画模拟加载效果
 *
 * @example
 * ```tsx
 * {inView ? <SystemPerformanceChart data={data} /> : <ChartSkeleton height={280} />}
 * ```
 */
export function ChartSkeleton({
  height = 300,
  showTitle = false,
  className,
}: ChartSkeletonProps) {
  return (
    <div className={cn('w-full space-y-4', className)} style={{ height }}>
      {/* 标题骨架(可选) */}
      {showTitle && (
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      )}

      {/* 图表主体骨架 */}
      <div className="flex h-full items-end justify-between gap-2">
        {/* 模拟柱状图/折线图 */}
        {Array.from({ length: 12 }).map((_, index) => {
          const randomHeight = 40 + Math.random() * 60 // 40-100%
          return (
            <div
              key={index}
              className="w-full animate-pulse rounded-t bg-gradient-to-t from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600"
              style={{
                height: `${randomHeight}%`,
                animationDelay: `${index * 0.1}s`,
              }}
            ></div>
          )
        })}
      </div>

      {/* 底部文字骨架 */}
      <div className="flex justify-between">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
            style={{ animationDelay: `${index * 0.15}s` }}
          ></div>
        ))}
      </div>
    </div>
  )
}
