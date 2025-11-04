import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/atoms'
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
  color: string
}

export const ExecutionStatsCards: React.FC<Props> = React.memo(({ executions }) => {
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
        color: 'blue'
      },
      {
        label: '执行中',
        count: statsAccumulator.running,
        color: 'blue'
      },
      {
        label: '已完成',
        count: statsAccumulator.completed,
        color: 'green'
      },
      {
        label: '失败',
        count: statsAccumulator.failed,
        color: 'red'
      },
      {
        label: '平均评分',
        count: avgScore,
        color: 'purple'
      }
    ]
  }, [executions])

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold text-${item.color}-600`}>
              {item.count}
            </div>
            <div className="text-sm text-gray-600">{item.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})
