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
import { cn } from '@/utils/cn'
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

  const CardShell: React.FC<{
    cardKey: AlertStatsCardKey
    title: string
    value: number
    valueClassName?: string
    icon: React.ReactNode
    iconClassName?: string
    onCardClick?: (card: AlertStatsCardKey) => void
  }> = ({ cardKey, title, value, valueClassName, icon, iconClassName, onCardClick }) => {
    const clickable = typeof onCardClick === 'function'

    const content = (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className={cn('text-2xl font-bold text-foreground', valueClassName)}>
            {value}
          </p>
        </div>
        <span className={cn('w-8 h-8 inline-flex items-center justify-center', iconClassName)}>
          {icon}
        </span>
      </div>
    )

    const cardClassName = cn(
      'rounded-xl border border-border/50 bg-card/80 backdrop-blur-lg shadow-lg',
      clickable && 'cursor-pointer hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40'
    )

    if (!clickable) {
      return (
        <div className={cardClassName}>
          <div className="p-4">{content}</div>
        </div>
      )
    }

    return (
      <button
        type="button"
        className={cardClassName}
        onClick={() => onCardClick(cardKey)}
        aria-label={`${title}：${value}`}
      >
        <div className="p-4">{content}</div>
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <CardShell
          cardKey="total"
          title="总告警"
          value={stats.total}
          icon={<Bell className="w-8 h-8 text-muted-foreground" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="critical"
          title="严重"
          value={stats.critical}
          valueClassName="text-red-600 dark:text-red-500"
          icon={<AlertCircle className="w-8 h-8 text-red-600 dark:text-red-500" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="warning"
          title="警告"
          value={stats.warning}
          valueClassName="text-yellow-600 dark:text-yellow-500"
          icon={<AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="info"
          title="信息"
          value={stats.info}
          valueClassName="text-blue-600 dark:text-blue-500"
          icon={<Info className="w-8 h-8 text-blue-600 dark:text-blue-500" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="active"
          title="活跃"
          value={stats.active}
          valueClassName="text-orange-600 dark:text-orange-500"
          icon={<Shield className="w-8 h-8 text-orange-600 dark:text-orange-500" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="acknowledged"
          title="已确认"
          value={stats.acknowledged}
          valueClassName="text-yellow-700 dark:text-yellow-400"
          icon={<Eye className="w-8 h-8 text-yellow-700 dark:text-yellow-400" />}
          onCardClick={onCardClick}
        />

        <CardShell
          cardKey="resolved"
          title="已解决"
          value={stats.resolved}
          valueClassName="text-green-600 dark:text-green-500"
          icon={<CheckCircle className="w-8 h-8 text-green-600 dark:text-green-500" />}
          onCardClick={onCardClick}
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
