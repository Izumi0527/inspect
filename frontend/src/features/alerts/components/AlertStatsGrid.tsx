import React from 'react'
import {
  Bell,
  AlertCircle,
  AlertTriangle,
  Info,
  Shield,
  CheckCircle,
  Eye
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

/**
 * 告警统计卡（可点击 = 分面筛选）。
 *
 * 精密仪器方向：读数默认中性；只有「严重 / 警告」大于零时获得状态强调。
 * 不再给七张卡各配一种彩色图标底（那正是「七个一样响」的模板感来源）。
 */
export const AlertStatsGrid: React.FC<AlertStatsGridProps> = ({ stats, onCardClick }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <CompactStatCard
        title="总告警"
        value={stats.total}
        icon={Bell}
        onClick={onCardClick ? () => onCardClick('total') : undefined}
      />

      <CompactStatCard
        title="严重"
        value={stats.critical}
        valueClassName={stats.critical > 0 ? 'text-danger' : undefined}
        icon={AlertCircle}
        onClick={onCardClick ? () => onCardClick('critical') : undefined}
      />

      <CompactStatCard
        title="警告"
        value={stats.warning}
        valueClassName={stats.warning > 0 ? 'text-warning' : undefined}
        icon={AlertTriangle}
        onClick={onCardClick ? () => onCardClick('warning') : undefined}
      />

      <CompactStatCard
        title="信息"
        value={stats.info}
        icon={Info}
        onClick={onCardClick ? () => onCardClick('info') : undefined}
      />

      <CompactStatCard
        title="活跃"
        value={stats.active}
        icon={Shield}
        onClick={onCardClick ? () => onCardClick('active') : undefined}
      />

      <CompactStatCard
        title="已确认"
        value={stats.acknowledged}
        icon={Eye}
        onClick={onCardClick ? () => onCardClick('acknowledged') : undefined}
      />

      <CompactStatCard
        title="已解决"
        value={stats.resolved}
        icon={CheckCircle}
        onClick={onCardClick ? () => onCardClick('resolved') : undefined}
      />
    </div>
  )
}
