import React from 'react'
import { Calendar, Clock, Hand } from 'lucide-react'
import { Badge } from '@/components/atoms/badge'
import { cn } from '@/utils/cn'
import { formatDateYMD, formatTimeHMS } from '@/utils/formatters'
import type { InspectionExecution } from '../types'
import {
  formatExecutionDuration,
  getExecutionScoreMeta,
  getExecutionStatusMeta,
  getTriggerMeta,
  normalizeExecutionSummary,
} from '../utils/executionPresentation'

interface AnalyticsRecentExecutionsProps {
  executions: InspectionExecution[]
  onSelectExecution: (execution: InspectionExecution) => void
}

/**
 * 统计分析底部「最近执行详情」面板。
 * 使用全站语义 Token 与高密度排布，支持点击策略名呼出执行详情弹窗下钻。
 */
export const AnalyticsRecentExecutions: React.FC<AnalyticsRecentExecutionsProps> = React.memo(({
  executions,
  onSelectExecution,
}) => {
  return (
    <section
      data-slot="card"
      data-testid="analytics-recent-executions"
      className="border text-card-foreground overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">最近执行详情</h3>
        </div>
        <span className="text-xs text-muted-foreground">仅展示当前统计区间内已完成记录</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">策略与触发</th>
              <th className="text-left px-4 py-2.5">执行状态</th>
              <th className="text-left px-4 py-2.5">巡检评分</th>
              <th className="text-left px-4 py-2.5">问题情况</th>
              <th className="text-left px-4 py-2.5">完成时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {executions.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={5}>
                  当前筛选范围内暂无已完成的执行记录
                </td>
              </tr>
            ) : (
              executions.map((item) => {
                const statusMeta = getExecutionStatusMeta(item.status)
                const triggerMeta = getTriggerMeta(item.triggerType)
                const summary = normalizeExecutionSummary(item.summary)
                const scoreMeta = getExecutionScoreMeta(summary.score, item.status, summary.totalChecks)
                const issueCount = summary.failedChecks + summary.warningChecks

                return (
                  <tr key={item.id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectExecution(item)}
                        className="text-left font-medium text-foreground hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
                      >
                        {item.strategyName || '-'}
                      </button>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {triggerMeta.isScheduled ? (
                          <Clock className="w-3 h-3 shrink-0" />
                        ) : (
                          <Hand className="w-3 h-3 shrink-0" />
                        )}
                        <span>{triggerMeta.label}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant={statusMeta.badgeVariant} size="sm">
                        {statusMeta.label}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className={cn('font-semibold tabular-nums', scoreMeta.colorClass)}>
                        {scoreMeta.display}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        通过 {summary.passedChecks}/{summary.totalChecks}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div
                        className={cn(
                          'font-medium tabular-nums',
                          issueCount > 0 ? 'text-danger' : 'text-success'
                        )}
                      >
                        {issueCount} 个问题
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        失败 {summary.failedChecks} / 警告 {summary.warningChecks}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-foreground tabular-nums whitespace-nowrap">
                        <span>{item.endTime ? formatDateYMD(item.endTime) : '-'}</span>
                        {item.endTime && <span>{formatTimeHMS(item.endTime)}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        耗时: {formatExecutionDuration(item.duration)}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
})

AnalyticsRecentExecutions.displayName = 'AnalyticsRecentExecutions'
