import React from 'react'
import {
  Monitor,
  AlertTriangle,
  Activity,
  Server,
  Shield
} from 'lucide-react'
import { CompactStatCard } from '@/components/shared'
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
  // 如果值是 "N/A"，直接返回
  if (value === 'N/A' || value === 'n/a' || value === '') {
    return 'N/A'
  }

  // 验证单位字段并进行格式化
  if (unit === 'bps') {
    // 验证单位为 bps 后进行带宽格式化
    const bpsValue = parseFloat(value)
    if (isNaN(bpsValue) || !isFinite(bpsValue)) {
      // 如果解析失败，返回 N/A 而不是原始值
      return 'N/A'
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-gray-200 dark:bg-gray-700 h-7 w-7" />
                <div className="ml-2.5 flex-1 min-w-0">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
                </div>
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
          <CompactStatCard
            key={index}
            title={stat.title}
            value={formattedValue}
            change={stat.change}
            trend={getTrend(stat.change)}
            icon={IconComponent}
            iconClassName={stat.iconColor}
          />
        )
      })}
    </div>
  )
}
