import React from 'react'
import {
  Monitor,
  AlertTriangle,
  Activity,
  Server,
  Shield
} from 'lucide-react'
import { StatCard } from '@/components/shared'
import { DashboardStat } from '../types'
import { Card, CardContent } from '@/components/atoms'
import { formatBandwidth } from '@/utils/formatters'

interface StatsGridProps {
  stats: DashboardStat[]
  loading?: boolean
}

// 图标映射
const iconMap = {
  Monitor,
  AlertTriangle,
  Activity,
  Server,
  Shield
}

// 从 change 字符串推断 trend
const getTrend = (change: string): 'up' | 'down' | 'stable' => {
  if (change.startsWith('+')) return 'up'
  if (change.startsWith('-')) return 'down'
  return 'stable'
}

// 根据单位字段格式化统计值
const formatStatValue = (value: string, unit?: string): string => {
  // 验证单位字段并进行格式化
  if (unit === 'bps') {
    // 验证单位为 bps 后进行带宽格式化
    const bpsValue = parseFloat(value)
    if (isNaN(bpsValue)) {
      console.warn('Invalid bps value received:', value)
      return value // 返回原始值
    }
    return formatBandwidth(bpsValue)
  }
  
  // 如果有其他单位但不是 bps，记录警告
  if (unit && unit !== 'bps') {
    console.warn(`Unexpected unit field: ${unit}, expected "bps" or undefined`)
  }
  
  // 对于没有单位字段的值，直接返回原始值
  return value
}

export const StatsGrid: React.FC<StatsGridProps> = ({ stats, loading = false }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-1"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
                </div>
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const IconComponent = iconMap[stat.iconName as keyof typeof iconMap]

        // 如果没有找到图标,使用默认图标
        if (!IconComponent) return null

        // 格式化统计值（如果有单位字段，进行相应的格式化）
        const formattedValue = formatStatValue(stat.value, stat.unit)

        return (
          <StatCard
            key={index}
            index={index}
            title={stat.title}
            value={formattedValue}
            change={stat.change}
            trend={getTrend(stat.change)}
            icon={IconComponent}
            iconColor={stat.iconColor}
          />
        )
      })}
    </div>
  )
}