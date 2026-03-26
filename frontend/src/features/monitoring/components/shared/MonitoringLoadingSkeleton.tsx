import { Card, CardContent } from '@/components/atoms'
import { ChartSkeleton } from '../charts'

/**
 * 监控页加载骨架屏（6 张统计卡 + 2 张图表卡）
 */
export function MonitoringLoadingSkeleton() {
  return (
    <main className="p-5">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-l-[3px] border-l-gray-300 dark:border-l-gray-600">
              <CardContent className="p-5">
                <div className="h-3 w-14 rounded bg-muted" />
                <div className="mt-3 h-7 w-20 rounded bg-muted" />
                <div className="mt-2 h-3 w-16 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="mt-2 h-4 w-48 rounded bg-muted" />
                <ChartSkeleton height={280} className="mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
