import React from 'react'
import { Network } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { NetworkTraffic } from '../types'

interface NetworkTrafficCardProps {
  traffic: NetworkTraffic
}

export const NetworkTrafficCard: React.FC<NetworkTrafficCardProps> = ({ traffic }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-purple-600" />
          网络流量
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">入口流量</span>
              <span className="text-sm font-medium">{traffic.inbound.value}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-500 h-3 rounded-full" 
                style={{ width: `${traffic.inbound.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">出口流量</span>
              <span className="text-sm font-medium">{traffic.outbound.value}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-green-500 h-3 rounded-full" 
                style={{ width: `${traffic.outbound.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">丢包率</span>
              <span className="text-sm font-medium text-red-600">{traffic.packetLoss.value}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-red-500 h-3 rounded-full" 
                style={{ width: `${traffic.packetLoss.percentage}%` }} 
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}