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
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            网络概览
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="text-center animate-pulse">
                  <div className="w-24 h-24 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mx-auto mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-600" />
          网络概览
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {overview.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {overview.map((item, index) => {
                const IconComponent = iconMap[item.iconName as keyof typeof iconMap]

                return (
                  <div key={index} className="text-center group hover:scale-105 transition-transform">
                    <div className={`w-24 h-24 mx-auto bg-gradient-to-br ${item.gradient} rounded-full flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition-shadow`}>
                      {IconComponent && <IconComponent className="w-12 h-12 text-white" />}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center py-12">
                <Network className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-muted-foreground text-lg mb-2">暂无网络概览数据</p>
                <p className="text-gray-400 dark:text-muted-foreground/70 text-sm">系统正在收集网络设备信息</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}