import React from 'react'
import { Network, Monitor, Shield } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { NetworkOverviewItem } from '../types'

interface NetworkOverviewCardProps {
  overview: NetworkOverviewItem[]
  loading?: boolean
}

// 图标映射
const iconMap = {
  Network,
  Monitor,
  Shield
}

export const NetworkOverviewCard: React.FC<NetworkOverviewCardProps> = ({ 
  overview, 
  loading = false 
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            网络概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="text-center animate-pulse">
                <div className="w-24 h-24 mx-auto bg-gray-200 rounded-full mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-20 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-600" />
          网络概览
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {overview.map((item, index) => {
            const IconComponent = iconMap[item.iconName as keyof typeof iconMap]
            
            return (
              <div key={index} className="text-center group hover:scale-105 transition-transform">
                <div className={`w-24 h-24 mx-auto bg-gradient-to-br ${item.gradient} rounded-full flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-shadow`}>
                  {IconComponent && <IconComponent className="w-12 h-12 text-white" />}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">
                  {item.count}{item.description}
                </p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}