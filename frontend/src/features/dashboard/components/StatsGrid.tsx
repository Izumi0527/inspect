import React from 'react'
import {
  Monitor,
  AlertTriangle,
  Activity,
  Server,
  Shield
} from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { DashboardStat } from '../types'

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

export const StatsGrid: React.FC<StatsGridProps> = ({ stats, loading = false }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-16 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-12"></div>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const IconComponent = iconMap[stat.iconName as keyof typeof iconMap]
        
        return (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1" data-testid="stat-title">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-value">{stat.value}</p>
                  <p className={`text-sm ${
                    stat.change.startsWith('+') ? 'text-green-600' :
                    stat.change.startsWith('-') ? 'text-red-600' : 'text-gray-600'
                  }`} data-testid="stat-change">
                    {stat.change} 较昨日
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-full" data-testid="stat-icon">
                  {IconComponent && <IconComponent className={`w-8 h-8 ${stat.iconColor}`} />}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}