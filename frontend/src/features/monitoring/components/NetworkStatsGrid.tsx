import React from 'react'
import { 
  Cpu, 
  HardDrive, 
  Network, 
  Gauge,
  TrendingUp,
  TrendingDown
} from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { NetworkStat } from '../types'

interface NetworkStatsGridProps {
  stats: NetworkStat[]
}

const iconMap = {
  cpu: Cpu,
  harddrive: HardDrive,
  network: Network,
  gauge: Gauge
}

export const NetworkStatsGrid: React.FC<NetworkStatsGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const IconComponent = iconMap[stat.icon as keyof typeof iconMap] || Gauge
        
        return (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg bg-${stat.color}-100`}>
                  <div className={`text-${stat.color}-600`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-sm ${
                  stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {stat.change}
                </div>
              </div>
              <div>
                <h3 className="text-sm text-gray-600 mb-1">{stat.title}</h3>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              
              {/* Mini Chart */}
              <div className="mt-4 h-8 flex items-end gap-1">
                {stat.data.map((point, i) => (
                  <div
                    key={i}
                    className={`flex-1 bg-${stat.color}-200 rounded-t`}
                    style={{ height: `${(point / Math.max(...stat.data)) * 100}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}