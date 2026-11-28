import React from 'react'
import { Activity, BarChart3, Target, TrendingUp } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import type { InspectionStats } from '../types'
import { parseChangeTrend } from '../utils/analyticsPresentation'

interface AnalyticsKpiStripProps {
  stats?: InspectionStats
  comparisonBaselineLabel: string
}

/**
 * 统计分析周期 KPI 卡片组（4 张独立统计卡）。
 * 沿用全站 CompactStatCard 视觉规格（classic 呈现经典彩色图标底衬与投影，
 * instrument 自动脱色），同时保留非负/区间钳制与真实涨跌方向计算。
 */
export const AnalyticsKpiStrip: React.FC<AnalyticsKpiStripProps> = React.memo(({
  stats,
  comparisonBaselineLabel,
}) => {
  const executionCount =
    typeof stats?.executionCount === 'number' && Number.isFinite(stats.executionCount)
      ? Math.max(0, stats.executionCount)
      : typeof stats?.todayExecutions === 'number' && Number.isFinite(stats.todayExecutions)
        ? Math.max(0, stats.todayExecutions)
        : 0

  const rawSuccessRate =
    typeof stats?.successRate === 'number' && Number.isFinite(stats.successRate)
      ? Math.max(0, Math.min(100, stats.successRate))
      : 0

  const rawAvgScore =
    typeof stats?.avgScore === 'number' && Number.isFinite(stats.avgScore)
      ? Math.max(0, Math.min(100, stats.avgScore))
      : 0

  const activeStrategies =
    typeof stats?.activeStrategies === 'number' && Number.isFinite(stats.activeStrategies)
      ? Math.max(0, stats.activeStrategies)
      : 0

  const metrics = [
    {
      title: '执行次数',
      value: executionCount,
      change: stats?.changes?.executionsChange,
      icon: Activity,
      iconClassName: 'text-blue-600',
      iconBgClassName: 'bg-blue-100 dark:bg-transparent',
      valueClassName: 'text-blue-600',
    },
    {
      title: '成功率',
      value: `${rawSuccessRate.toFixed(1)}%`,
      change: stats?.changes?.successRateChange,
      icon: Target,
      iconClassName: 'text-green-600',
      iconBgClassName: 'bg-green-100 dark:bg-transparent',
      valueClassName: 'text-green-600',
    },
    {
      title: '平均评分',
      value: rawAvgScore.toFixed(1),
      change: stats?.changes?.avgScoreChange,
      icon: TrendingUp,
      iconClassName: 'text-purple-600',
      iconBgClassName: 'bg-purple-100 dark:bg-transparent',
      valueClassName: 'text-purple-600',
    },
    {
      title: '活跃策略',
      value: activeStrategies,
      change: stats?.changes?.strategiesChange,
      icon: BarChart3,
      iconClassName: 'text-orange-600',
      iconBgClassName: 'bg-orange-100 dark:bg-transparent',
      valueClassName: 'text-orange-600',
    },
  ] as const

  return (
    <div
      data-testid="analytics-kpi-strip"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
    >
      {metrics.map((metric) => {
        const parsed = parseChangeTrend(metric.change)
        const trend =
          parsed.direction === 'up'
            ? 'up'
            : parsed.direction === 'down'
              ? 'down'
              : 'stable'

        return (
          <CompactStatCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            change={parsed.display}
            changeHint={comparisonBaselineLabel}
            trend={trend}
            icon={metric.icon}
            iconClassName={metric.iconClassName}
            iconBgClassName={metric.iconBgClassName}
            valueClassName={metric.valueClassName}
          />
        )
      })}
    </div>
  )
})

AnalyticsKpiStrip.displayName = 'AnalyticsKpiStrip'
