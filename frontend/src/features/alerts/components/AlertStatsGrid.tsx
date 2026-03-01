import React from 'react'
import { 
  Bell, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Shield,
  CheckCircle,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { AlertStats } from '../types'

interface AlertStatsGridProps {
  stats: AlertStats
}

export const AlertStatsGrid: React.FC<AlertStatsGridProps> = ({ stats }) => {
  const trends = stats.trends as Record<string, unknown> | undefined
  const todayCount = (trends?.today as number) ?? 0
  const yesterdayCount = (trends?.yesterday as number) ?? 0
  const changePercent = (trends?.change as number) ?? 0

  const TrendIcon = changePercent > 0 ? TrendingUp : changePercent < 0 ? TrendingDown : Minus
  const trendColor = changePercent > 0 ? 'text-red-500' : changePercent < 0 ? 'text-green-500' : 'text-gray-400'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总告警</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">严重</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-500">{stats.critical}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">警告</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">{stats.warning}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">信息</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">{stats.info}</p>
              </div>
              <Info className="w-8 h-8 text-blue-600 dark:text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">活跃</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-500">{stats.active}</p>
              </div>
              <Shield className="w-8 h-8 text-orange-600 dark:text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">已确认</p>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{stats.acknowledged}</p>
              </div>
              <Eye className="w-8 h-8 text-yellow-700 dark:text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">已解决</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-500">{stats.resolved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 趋势行 */}
      {trends && (todayCount > 0 || yesterdayCount > 0) && (
        <div className="flex items-center gap-4 px-2 text-sm text-muted-foreground">
          <span>今日新增: <span className="font-medium text-foreground">{todayCount}</span></span>
          <span>昨日: <span className="font-medium">{yesterdayCount}</span></span>
          {changePercent !== 0 && (
            <span className={`flex items-center gap-1 ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {Math.abs(changePercent).toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
