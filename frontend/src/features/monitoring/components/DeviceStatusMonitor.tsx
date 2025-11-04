import React from 'react'
import { Activity, Settings } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { DeviceMonitoringStatus } from '../types'
import { useStatusColors } from '../hooks/useMonitoring'

interface DeviceStatusMonitorProps {
  devices: DeviceMonitoringStatus[]
}

export const DeviceStatusMonitor: React.FC<DeviceStatusMonitorProps> = ({ devices }) => {
  const { getStatusColor, getStatusText, getPerformanceColor } = useStatusColors()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            设备状态监控
          </CardTitle>
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {devices.map((device, index) => (
            <div key={index} className="p-4 border rounded-lg hover:bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">{device.name}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(device.status)}`}>
                  {getStatusText(device.status)}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-600">CPU</span>
                    <span className="font-medium">{device.cpu}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getPerformanceColor(device.cpu)}`}
                      style={{ width: `${device.cpu}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-600">内存</span>
                    <span className="font-medium">{device.memory}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getPerformanceColor(device.memory)}`}
                      style={{ width: `${device.memory}%` }}
                    />
                  </div>
                </div>
                
                <div className="text-center">
                  <span className="text-gray-600">可用性</span>
                  <div className="font-medium text-green-600">{device.uptime}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}