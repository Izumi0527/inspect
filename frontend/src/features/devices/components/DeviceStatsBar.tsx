'use client'

import React from 'react'
import {
  Server,
  CheckCircle,
  Power,
  AlertTriangle,
} from 'lucide-react'
import { CompactStatCard } from '@/components/shared/CompactStatCard'
import { useSkin } from '@/lib/contexts/skin-context'

interface DeviceStatsBarProps {
  summary: {
    total: number
    online: number
    offline: number
    alerting: number
    totalAlerts: number
  }
}

/**
 * 设备统计卡栏 —— 五张读数卡。
 *
 * 精密仪器方向：读数默认中性；只有异常值（离线 / 告警 > 0）获得状态强调。
 * 经典皮肤沿用旧配方：五项固定配色（蓝 / 绿 / 红 / 黄 / 紫）。
 */
export const DeviceStatsBar: React.FC<DeviceStatsBarProps> = ({ summary }) => {
  const { skin } = useSkin()
  const isClassic = skin === 'classic'

  const items = [
    {
      label: '总设备数',
      value: summary.total,
      icon: Server,
      classic: { icon: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', value: undefined },
      valueClassName: undefined as string | undefined,
    },
    {
      label: '在线设备',
      value: summary.online,
      icon: CheckCircle,
      classic: { icon: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', value: 'text-green-600 dark:text-green-400' },
      valueClassName: undefined,
    },
    {
      label: '离线设备',
      value: summary.offline,
      icon: Power,
      classic: { icon: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', value: 'text-red-600 dark:text-red-400' },
      valueClassName: summary.offline > 0 ? 'text-danger' : undefined,
    },
    {
      label: '告警设备',
      value: summary.alerting,
      icon: AlertTriangle,
      classic: { icon: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', value: 'text-yellow-600 dark:text-yellow-400' },
      valueClassName: summary.alerting > 0 ? 'text-warning' : undefined,
    },
    {
      label: '总告警数',
      value: summary.totalAlerts,
      icon: AlertTriangle,
      classic: { icon: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', value: 'text-purple-600 dark:text-purple-400' },
      valueClassName: undefined,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <CompactStatCard
          key={item.label}
          title={item.label}
          value={item.value}
          icon={item.icon}
          iconClassName={isClassic ? item.classic.icon : undefined}
          iconBgClassName={isClassic ? item.classic.bg : undefined}
          valueClassName={isClassic ? item.classic.value : item.valueClassName}
        />
      ))}
    </div>
  )
}
