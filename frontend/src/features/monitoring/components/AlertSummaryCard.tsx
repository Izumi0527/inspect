import React from 'react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { AlertSummary } from '../types'

interface AlertSummaryCardProps {
  summary: AlertSummary
  onViewDetails?: () => void
}

export const AlertSummaryCard: React.FC<AlertSummaryCardProps> = ({ 
  summary, 
  onViewDetails 
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-red-600">告警汇总</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">严重告警</span>
            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
              {summary.critical}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">警告告警</span>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              {summary.warning}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">信息提示</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
              {summary.info}
            </span>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          className="w-full mt-4"
          onClick={onViewDetails}
        >
          查看详细告警
        </Button>
      </CardContent>
    </Card>
  )
}