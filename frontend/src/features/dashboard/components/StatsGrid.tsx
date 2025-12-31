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

        return (
          <StatCard
            key={index}
            index={index}
            title={stat.title}
            value={stat.value}
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