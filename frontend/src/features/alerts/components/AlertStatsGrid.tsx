import React from 'react'
import { 
  Bell, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Shield 
} from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { AlertStats } from '../types'

interface AlertStatsGridProps {
  stats: AlertStats
}

export const AlertStatsGrid: React.FC<AlertStatsGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">总告警数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Bell className="w-8 h-8 text-gray-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">严重告警</p>
              <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">警告告警</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.warning}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">信息告警</p>
              <p className="text-2xl font-bold text-blue-600">{stats.info}</p>
            </div>
            <Info className="w-8 h-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">活跃告警</p>
              <p className="text-2xl font-bold text-orange-600">{stats.active}</p>
            </div>
            <Shield className="w-8 h-8 text-orange-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}