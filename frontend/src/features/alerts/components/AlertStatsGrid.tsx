import React from 'react'
import { 
  Bell, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Shield,
  CheckCircle,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
import { AlertStats } from '../types'

export type AlertStatsCardKey =
  | 'total'
  | 'critical'
  | 'warning'
  | 'info'
  | 'active'
  | 'acknowledged'
  | 'resolved'

interface AlertStatsGridProps {
  stats: AlertStats
  onCardClick?: (card: AlertStatsCardKey) => void
}

export const AlertStatsGrid: React.FC<AlertStatsGridProps> = ({ stats, onCardClick }) => {
  const trends = stats.trends as Record<string, unknown> | undefined
  const todayCount = (trends?.today as number) ?? 0
  const yesterdayCount = (trends?.yesterday as number) ?? 0
  const changePercent = (trends?.change as number) ?? 0

  const TrendIcon = changePercent > 0 ? TrendingUp : changePercent < 0 ? TrendingDown : Minus
  const trendColor = changePercent > 0 ? 'text-red-500' : changePercent < 0 ? 'text-green-500' : 'text-gray-400'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <CompactStatCard
          title="总告警"
          value={stats.total}
          icon={Bell}
          iconClassName="text-muted-foreground"
          onClick={onCardClick ? () => onCardClick('total') : undefined}
        />

        <CompactStatCard
          title="严重"
          value={stats.critical}
          valueClassName="text-red-600 dark:text-red-500"
          icon={AlertCircle}
          iconClassName="text-red-600 dark:text-red-500"
          onClick={onCardClick ? () => onCardClick('critical') : undefined}
        />

        <CompactStatCard
          title="警告"
          value={stats.warning}
          valueClassName="text-yellow-600 dark:text-yellow-500"
          icon={AlertTriangle}
          iconClassName="text-yellow-600 dark:text-yellow-500"
          onClick={onCardClick ? () => onCardClick('warning') : undefined}
        />

        <CompactStatCard
          title="信息"
          value={stats.info}
          valueClassName="text-blue-600 dark:text-blue-500"
          icon={Info}
          iconClassName="text-blue-600 dark:text-blue-500"
          onClick={onCardClick ? () => onCardClick('info') : undefined}
        />

        <CompactStatCard
          title="活跃"
          value={stats.active}
          valueClassName="text-orange-600 dark:text-orange-500"
          icon={Shield}
          iconClassName="text-orange-600 dark:text-orange-500"
          onClick={onCardClick ? () => onCardClick('active') : undefined}
        />

        <CompactStatCard
          title="已确认"
          value={stats.acknowledged}
          valueClassName="text-yellow-700 dark:text-yellow-400"
          icon={Eye}
          iconClassName="text-yellow-700 dark:text-yellow-400"
          onClick={onCardClick ? () => onCardClick('acknowledged') : undefined}
        />

        <CompactStatCard
          title="已解决"
          value={stats.resolved}
          valueClassName="text-green-600 dark:text-green-500"
          icon={CheckCircle}
          iconClassName="text-green-600 dark:text-green-500"
          onClick={onCardClick ? () => onCardClick('resolved') : undefined}
        />
      </div>

      {/* 趋势行 */}
      {trends && (todayCount > 0 || yesterdayCount > 0) && (
        <div className="flex items-center gap-4 px-2 text-sm text-muted-foreground">
          <span>今日新增: <span className="font-medium text-foreground">{todayCount}</span></span>
          <span>昨日: <span className="font-medium">{yesterdayCount}</span></span>
          {changePercent !== 0 && (
            <span className={`flex items-center gap-1 ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {Math.abs(changePercent).toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
