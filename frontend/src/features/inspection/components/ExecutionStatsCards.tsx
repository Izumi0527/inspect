import React, { useMemo } from 'react'
import {
  Activity,
  CheckCircle,
  ListChecks,
  Star,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import type { InspectionExecution } from '../types'

/**
 * 执行统计卡片组件
 *
 * 显示执行记录的统计信息：
 * - 总执行数
 * - 执行中数量
 * - 已完成数量
 * - 失败数量
 * - 平均评分
 */

interface Props {
  executions: InspectionExecution[]
}

interface StatItem {
  label: string
  count: number | string
  colorClass: string
}

export const ExecutionStatsCards: React.FC<Props> = React.memo(({ executions }) => {
  const cardMeta: Record<string, { icon: LucideIcon; className: string }> = {
    总执行数: { icon: ListChecks, className: 'text-blue-600 dark:text-blue-400' },
    执行中: { icon: Activity, className: 'text-blue-600 dark:text-blue-400' },
    已完成: { icon: CheckCircle, className: 'text-green-600 dark:text-green-400' },
    失败: { icon: XCircle, className: 'text-red-600 dark:text-red-400' },
    平均评分: { icon: Star, className: 'text-purple-600 dark:text-purple-400' },
  }

  // 使用 useMemo 缓存统计计算,只在 executions 变化时重新计算
  const stats: StatItem[] = useMemo(() => {
    // 单次遍历计算所有统计数据,避免多次过滤
    const statsAccumulator = executions.reduce(
      (acc, execution) => {
        acc.total++
        if (execution.status === 'running') acc.running++
        if (execution.status === 'completed') acc.completed++
        if (execution.status === 'failed') acc.failed++
        acc.totalScore += execution.summary.score
        return acc
      },
      { total: 0, running: 0, completed: 0, failed: 0, totalScore: 0 }
    )

    const avgScore =
      statsAccumulator.total > 0
        ? (statsAccumulator.totalScore / statsAccumulator.total).toFixed(1)
        : '0'

    return [
      {
        label: '总执行数',
        count: statsAccumulator.total,
        colorClass: 'text-blue-600'
      },
      {
        label: '执行中',
        count: statsAccumulator.running,
        colorClass: 'text-blue-600'
      },
      {
        label: '已完成',
        count: statsAccumulator.completed,
        colorClass: 'text-green-600'
      },
      {
        label: '失败',
        count: statsAccumulator.failed,
        colorClass: 'text-red-600'
      },
      {
        label: '平均评分',
        count: avgScore,
        colorClass: 'text-purple-600'
      }
    ]
  }, [executions])

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map((item) => (
        <CompactStatCard
          key={item.label}
          title={item.label}
          value={item.count}
          icon={cardMeta[item.label]?.icon ?? ListChecks}
          iconClassName={cardMeta[item.label]?.className ?? 'text-blue-600 dark:text-blue-400'}
          valueClassName={cardMeta[item.label]?.className ?? 'text-blue-600 dark:text-blue-400'}
        />
      ))}
    </div>
  )
})
