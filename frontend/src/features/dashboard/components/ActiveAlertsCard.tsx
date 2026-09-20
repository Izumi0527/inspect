import React from 'react'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { cn } from '@/utils/cn'
import { RecentAlert } from '../types'
import { useAlertSeverityStyles } from '../hooks/useDashboard'
import { formatDateTimeYMDHM } from '@/utils/formatters'

interface ActiveAlertsCardProps {
  alerts: RecentAlert[]
  // 活跃告警总数：后端只下发预览条数，总数单独给，缺省取列表长度
  total?: number
  loading?: boolean
  className?: string
}

// 总览上的实时告警只是快速预览：列表在卡片内滚动，窗口越高看到越多；条数封顶，全量去告警中心
const PREVIEW_LIMIT = 20

const CardShell: React.FC<{ className?: string; count?: number; children: React.ReactNode }> = ({
  className,
  count,
  children,
}) => (
  <Card className={cn('flex flex-col overflow-hidden', className)}>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-red-600" />
        实时告警
        {typeof count === 'number' && count > 0 && (
          <span
            data-testid="active-alerts-count"
            className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {count}
          </span>
        )}
      </CardTitle>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col p-0">{children}</CardContent>
  </Card>
)

// 实时告警：只展示当前活跃（open/acknowledged）的告警，告警被解决或自动恢复后即从列表消失
export const ActiveAlertsCard: React.FC<ActiveAlertsCardProps> = ({
  alerts,
  total,
  loading = false,
  className,
}) => {
  const { getSeverityColor } = useAlertSeverityStyles()

  if (loading) {
    return (
      <CardShell className={className}>
        <div className="space-y-3 px-6 pb-6">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="flex items-center gap-3 p-3 bg-muted/40 dark:bg-accent/5 rounded-lg">
                <div className="w-2 h-2 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32 mb-1"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-48"></div>
                </div>
                <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-12"></div>
              </div>
            </div>
          ))}
        </div>
      </CardShell>
    )
  }

  if (alerts.length === 0) {
    return (
      <CardShell className={className}>
        <div className="px-6 pb-6 text-center py-8">
          <Shield className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-muted-foreground">当前无活跃告警</p>
        </div>
      </CardShell>
    )
  }

  const preview = alerts.slice(0, PREVIEW_LIMIT)
  const totalCount = Math.max(total ?? 0, alerts.length)

  return (
    <CardShell className={className} count={totalCount}>
      <div
        data-testid="active-alerts-list"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-2 max-h-[60vh] lg:max-h-none"
      >
        {preview.map((alert) => (
          <div
            key={alert.id}
            data-testid="active-alert-item"
            className="flex items-start gap-3 rounded-lg bg-muted/40 p-2.5 transition-colors hover:bg-gray-100 dark:bg-accent/5 dark:hover:bg-accent/10"
          >
            <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getSeverityColor(alert.severity))} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">{alert.device}</p>
                <span className="shrink-0 text-[11px] text-gray-500 dark:text-muted-foreground">
                  {formatDateTimeYMDHM(alert.time)}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground" title={alert.message}>
                {alert.message}
              </p>
              {alert.category && (
                <span className="mt-1 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-gray-700">
                  {alert.category}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 px-6 py-3">
        <Button asChild variant="outline" className="w-full">
          <Link href="/alerts">
            查看所有告警{totalCount > preview.length ? `（共 ${totalCount} 条）` : ''}
          </Link>
        </Button>
      </div>
    </CardShell>
  )
}
