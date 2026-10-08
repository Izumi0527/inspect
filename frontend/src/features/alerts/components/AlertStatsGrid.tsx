'use client'

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
import { useSkin } from '@/lib/contexts/skin-context'
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

/** 经典皮肤沿用旧配方：七张卡各配一种颜色（读数与图标同色）。 */
const CLASSIC_COLORS: Record<AlertStatsCardKey, { icon: string; value?: string }> = {
  total: { icon: 'text-muted-foreground' },
  critical: { icon: 'text-red-600 dark:text-red-500', value: 'text-red-600 dark:text-red-500' },
  warning: { icon: 'text-yellow-600 dark:text-yellow-500', value: 'text-yellow-600 dark:text-yellow-500' },
  info: { icon: 'text-blue-600 dark:text-blue-500', value: 'text-blue-600 dark:text-blue-500' },
  active: { icon: 'text-orange-600 dark:text-orange-500', value: 'text-orange-600 dark:text-orange-500' },
  acknowledged: { icon: 'text-yellow-700 dark:text-yellow-400', value: 'text-yellow-700 dark:text-yellow-400' },
  resolved: { icon: 'text-green-600 dark:text-green-500', value: 'text-green-600 dark:text-green-500' },
}

/**
 * 告警统计卡（可点击 = 分面筛选）。
 *
 * 精密仪器方向：读数默认中性；只有「严重 / 警告」大于零时获得状态强调。
 * 经典 / 玻璃皮肤沿用旧配方：七张卡各配一种彩色图标底。
 */
export const AlertStatsGrid: React.FC<AlertStatsGridProps> = ({ stats, onCardClick }) => {
  const { skin } = useSkin()
  const isInstrument = skin === 'instrument'

  const classicOf = (key: AlertStatsCardKey) => (isInstrument ? undefined : CLASSIC_COLORS[key])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <CompactStatCard
        title="总告警"
        value={stats.total}
        icon={Bell}
        iconClassName={classicOf('total')?.icon}
        onClick={onCardClick ? () => onCardClick('total') : undefined}
      />

      <CompactStatCard
        title="严重"
        value={stats.critical}
        valueClassName={isInstrument ? (stats.critical > 0 ? 'text-danger' : undefined) : CLASSIC_COLORS.critical.value}
        icon={AlertCircle}
        iconClassName={classicOf('critical')?.icon}
        onClick={onCardClick ? () => onCardClick('critical') : undefined}
      />

      <CompactStatCard
        title="警告"
        value={stats.warning}
        valueClassName={isInstrument ? (stats.warning > 0 ? 'text-warning' : undefined) : CLASSIC_COLORS.warning.value}
        icon={AlertTriangle}
        iconClassName={classicOf('warning')?.icon}
        onClick={onCardClick ? () => onCardClick('warning') : undefined}
      />

      <CompactStatCard
        title="信息"
        value={stats.info}
        valueClassName={classicOf('info')?.value}
        icon={Info}
        iconClassName={classicOf('info')?.icon}
        onClick={onCardClick ? () => onCardClick('info') : undefined}
      />

      <CompactStatCard
        title="活跃"
        value={stats.active}
        valueClassName={classicOf('active')?.value}
        icon={Shield}
        iconClassName={classicOf('active')?.icon}
        onClick={onCardClick ? () => onCardClick('active') : undefined}
      />

      <CompactStatCard
        title="已确认"
        value={stats.acknowledged}
        valueClassName={classicOf('acknowledged')?.value}
        icon={Eye}
        iconClassName={classicOf('acknowledged')?.icon}
        onClick={onCardClick ? () => onCardClick('acknowledged') : undefined}
      />

      <CompactStatCard
        title="已解决"
        value={stats.resolved}
        valueClassName={classicOf('resolved')?.value}
        icon={CheckCircle}
        iconClassName={classicOf('resolved')?.icon}
        onClick={onCardClick ? () => onCardClick('resolved') : undefined}
      />
    </div>
  )
}
