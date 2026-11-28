import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ProblemRankingItem } from '../utils/analyticsPresentation'

interface AnalyticsProblemRankingProps {
  items: ProblemRankingItem[]
  total: number
}

const MAX_RANKING_ITEMS = 8

/**
 * 高频问题分布水平排行组件。
 * 相比竖向柱状图更直观展示异常项类别、绝对数量与占比，并支持长标签。
 */
export const AnalyticsProblemRanking: React.FC<AnalyticsProblemRankingProps> = React.memo(({
  items,
  total,
}) => {
  if (items.length === 0 || total <= 0) {
    return (
      <div className="h-[240px] flex flex-col items-center justify-center text-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium text-foreground">当前统计周期内暂无异常问题</div>
        <p className="text-xs text-muted-foreground">所有巡检检查项均运行平稳</p>
      </div>
    )
  }

  const visibleItems = items.slice(0, MAX_RANKING_ITEMS)
  const hiddenCount = items.length - visibleItems.length
  const hiddenTotal = hiddenCount > 0
    ? items.slice(MAX_RANKING_ITEMS).reduce((sum, item) => sum + item.count, 0)
    : 0

  return (
    <div className="min-h-[240px] flex flex-col justify-between gap-3">
      <div className="space-y-2.5">
        {visibleItems.map((item, index) => {
          const rankBadgeClass =
            index === 0
              ? 'bg-danger-soft text-danger-soft-foreground'
              : index <= 2
                ? 'bg-warning-soft text-warning-soft-foreground'
                : 'bg-surface-2 text-muted-foreground'

          const barFillClass =
            index === 0
              ? 'bg-danger'
              : index <= 2
                ? 'bg-warning'
                : 'bg-primary'

          return (
            <div key={item.category} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums',
                      rankBadgeClass
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium text-foreground truncate" title={item.category}>
                    {item.category}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                  <span className="font-semibold text-foreground">{item.count} 项</span>
                  <span className="text-muted-foreground w-12 text-right">
                    {item.percent.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', barFillClass)}
                  style={{ width: `${item.barPercent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {hiddenCount > 0 && (
        <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground tabular-nums">
          其余 {hiddenCount} 类共 {hiddenTotal} 项
        </div>
      )}
    </div>
  )
})

AnalyticsProblemRanking.displayName = 'AnalyticsProblemRanking'
