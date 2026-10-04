'use client'

import React from 'react'
import {
  Server,
  CheckCircle,
  Power,
  AlertTriangle,
} from 'lucide-react'
import { CompactStatCard } from '@/components/shared/CompactStatCard'

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
 * 实现收敛为共享 CompactStatCard，不再维护本地重复实现与硬编码调色板。
 */
export const DeviceStatsBar: React.FC<DeviceStatsBarProps> = ({ summary }) => {
  const items = [
    { label: '总设备数', value: summary.total, icon: Server, valueClassName: undefined as string | undefined },
    { label: '在线设备', value: summary.online, icon: CheckCircle, valueClassName: undefined },
    {
      label: '离线设备',
      value: summary.offline,
      icon: Power,
      valueClassName: summary.offline > 0 ? 'text-danger' : undefined,
    },
    {
      label: '告警设备',
      value: summary.alerting,
      icon: AlertTriangle,
      valueClassName: summary.alerting > 0 ? 'text-warning' : undefined,
    },
    { label: '总告警数', value: summary.totalAlerts, icon: AlertTriangle, valueClassName: undefined },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <CompactStatCard
          key={item.label}
          title={item.label}
          value={item.value}
          icon={item.icon}
          valueClassName={item.valueClassName}
        />
      ))}
    </div>
  )
}
