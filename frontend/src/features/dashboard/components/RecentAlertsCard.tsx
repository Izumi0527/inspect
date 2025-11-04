import React from 'react'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { RecentAlert } from '../types'
import { useAlertSeverityStyles } from '../hooks/useDashboard'

interface RecentAlertsCardProps {
  alerts: RecentAlert[]
  loading?: boolean
}

export const RecentAlertsCard: React.FC<RecentAlertsCardProps> = ({ 
  alerts, 
  loading = false 
}) => {
  const { getSeverityColor } = useAlertSeverityStyles()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-600" />
            最近告警
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-300 rounded w-32 mb-1"></div>
                    <div className="h-3 bg-gray-300 rounded w-48"></div>
                  </div>
                  <div className="h-3 bg-gray-300 rounded w-12"></div>
                </div>
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
          <Shield className="w-5 h-5 text-red-600" />
          最近告警
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.length > 0 ? (
            <>
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className={`w-2 h-2 rounded-full ${getSeverityColor(alert.severity)}`} />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{alert.device}</p>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                    {alert.category && (
                      <span className="inline-block px-2 py-1 mt-1 text-xs bg-gray-200 text-gray-700 rounded-full">
                        {alert.category}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{alert.time}</span>
                </div>
              ))}
              <Link href="/alerts" passHref>
                <Button variant="outline" className="w-full mt-4">
                  查看所有告警
                </Button>
              </Link>
            </>
          ) : (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无最近告警</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}