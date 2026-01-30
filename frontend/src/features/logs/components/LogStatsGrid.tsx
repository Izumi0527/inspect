/**
 * 日志统计卡片网格
 */
import React from 'react'
import { FileText, AlertTriangle, AlertCircle, Activity } from 'lucide-react'
import { StatCard } from '@/components/shared'
import type { LogStatistics } from '../types'

interface LogStatsGridProps {
  stats: LogStatistics
}

export const LogStatsGrid: React.FC<LogStatsGridProps> = ({ stats }) => {
  // 计算各级别日志数量
  const errorCount = (stats.by_level?.error || 0) + (stats.by_level?.critical || 0)
  const warningCount = stats.by_level?.warning || 0

  // 计算设备数量
  const deviceCount = Object.keys(stats.by_device || {}).length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="总日志数"
        value={stats.total_logs.toLocaleString()}
        icon={FileText}
        trend="stable"
      />
      
      <StatCard
        title="错误日志"
        value={errorCount.toLocaleString()}
        icon={AlertCircle}
        trend={errorCount > 0 ? 'up' : 'stable'}
      />
      
      <StatCard
        title="警告日志"
        value={warningCount.toLocaleString()}
        icon={AlertTriangle}
        trend={warningCount > 10 ? 'up' : 'stable'}
      />
      
      <StatCard
        title="涉及设备"
        value={deviceCount.toLocaleString()}
        icon={Activity}
        trend="stable"
      />
    </div>
  )
}
