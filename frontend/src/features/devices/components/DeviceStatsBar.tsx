'use client'

import React from 'react'
import {
  Server,
  CheckCircle,
  Power,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'

interface StatItem {
  label: string
  value: number
  icon: LucideIcon
  bgColor: string
  iconColor: string
  valueColor?: string
}

interface DeviceStatsBarProps {
  summary: {
    total: number
    online: number
    offline: number
    alerting: number
    totalAlerts: number
  }
}

const STAT_ITEMS: Omit<StatItem, 'value'>[] = [
  {
    label: '总设备数',
    icon: Server,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: '在线设备',
    icon: CheckCircle,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    valueColor: 'text-green-600 dark:text-green-400',
  },
  {
    label: '离线设备',
    icon: Power,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    valueColor: 'text-red-600 dark:text-red-400',
  },
  {
    label: '告警设备',
    icon: AlertTriangle,
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    valueColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    label: '总告警数',
    icon: AlertTriangle,
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    valueColor: 'text-purple-600 dark:text-purple-400',
  },
]

/** 设备统计卡片栏 — 数据驱动，消除 5 张卡片的重复 JSX */
export const DeviceStatsBar: React.FC<DeviceStatsBarProps> = ({ summary }) => {
  const values = [
    summary.total,
    summary.online,
    summary.offline,
    summary.alerting,
    summary.totalAlerts,
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {STAT_ITEMS.map((item, index) => {
        const Icon = item.icon
        return (
          <Card key={item.label}>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className={`p-1 rounded-md ${item.bgColor}`}>
                  <Icon className={`h-5 w-5 ${item.iconColor}`} />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    {item.label}
                  </p>
                  <p className={`text-lg font-bold leading-none ${item.valueColor || 'text-foreground'}`}>
                    {values[index]}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
