import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  Wifi,
  Server,
  Eye,
  EyeOff,
  Settings,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Loading
} from '@/components/atoms'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTrafficAnalysis, useTrafficRealtime, useTrafficFilter } from '../hooks/useTrafficAnalysis'
import { TrafficViewMode } from '../types'
import { TrafficRealtimeChart } from './TrafficRealtimeChart'
import { TrafficTrendsChart } from './TrafficTrendsChart'
import { TrafficAnomaliesPanel } from './TrafficAnomaliesPanel'
import { TrafficSummaryCards } from './TrafficSummaryCards'

interface TrafficAnalysisViewProps {
  deviceIps?: string[]
}

export const TrafficAnalysisView: React.FC<TrafficAnalysisViewProps> = ({
  deviceIps = []
}) => {
  const [viewMode, setViewMode] = useState<TrafficViewMode>('summary')
  const [selectedDevices, setSelectedDevices] = useState<string[]>(deviceIps)
  const [isMonitoringActive, setIsMonitoringActive] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30)
  
  const {
    isLoading,
    error,
    startMonitoring
  } = useTrafficAnalysis()
  
  const {
    trafficData,
    isActive: realtimeActive,
    startRealtime,
    stopRealtime
  } = useTrafficRealtime(selectedDevices, refreshInterval * 1000)
  
  const { filter } = useTrafficFilter()

  const handleStartMonitoring = async () => {
    try {
      await startMonitoring({
        device_ips: selectedDevices,
        analysis_period_hours: 24,
        enable_anomaly_detection: true
      })
      setIsMonitoringActive(true)
      startRealtime()
    } catch (error) {
      console.error('Failed to start monitoring:', error)
    }
  }

  const handleStopMonitoring = () => {
    setIsMonitoringActive(false)
    stopRealtime()
  }

  const handleDeviceSelection = (deviceIp: string, selected: boolean) => {
    if (selected) {
      setSelectedDevices(prev => [...prev, deviceIp])
    } else {
      setSelectedDevices(prev => prev.filter(ip => ip !== deviceIp))
    }
  }

  const renderViewModeContent = () => {
    switch (viewMode) {
      case 'realtime':
        return (
          <TrafficRealtimeChart 
            trafficData={trafficData}
            isActive={realtimeActive}
          />
        )
      case 'trends':
        return (
          <TrafficTrendsChart 
            deviceIps={selectedDevices}
            timeRange={filter.time_range}
          />
        )
      case 'anomalies':
        return (
          <TrafficAnomaliesPanel 
            deviceIps={selectedDevices}
            filter={filter}
          />
        )
      case 'summary':
      default:
        return (
          <TrafficSummaryCards 
            deviceIps={selectedDevices}
          />
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* 顶部控制栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            {/* 左侧：视图切换 */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-1">
                {([
                  { key: 'summary', label: '概览', icon: Activity },
                  { key: 'realtime', label: '实时', icon: Wifi },
                  { key: 'trends', label: '趋势', icon: TrendingUp },
                  { key: 'anomalies', label: '异常', icon: AlertTriangle }
                ] as const).map(({ key, label, icon: Icon }) => (
                  <Button
                    key={key}
                    variant={viewMode === key ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode(key)}
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* 右侧：控制按钮 */}
            <div className="flex items-center gap-2">
              {/* 监控开关 */}
              <Button
                variant={isMonitoringActive ? 'default' : 'outline'}
                size="sm"
                onClick={isMonitoringActive ? handleStopMonitoring : handleStartMonitoring}
                disabled={selectedDevices.length === 0}
                className="flex items-center gap-2"
              >
                {isMonitoringActive ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    停止监控
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    开始监控
                  </>
                )}
              </Button>

              {/* 刷新间隔设置 */}
              <Select
                value={refreshInterval.toString()}
                onValueChange={(value) => setRefreshInterval(parseInt(value))}
              >
                <SelectTrigger className="w-32" aria-label="流量刷新间隔">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10秒</SelectItem>
                  <SelectItem value="30">30秒</SelectItem>
                  <SelectItem value="60">1分钟</SelectItem>
                  <SelectItem value="300">5分钟</SelectItem>
                </SelectContent>
              </Select>

              {/* 设置按钮 */}
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 设备选择器 */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">监控设备</h4>
              <Badge variant="outline">
                {selectedDevices.length} 个设备
              </Badge>
            </div>
            
            {/* 设备列表 */}
            <div className="flex flex-wrap gap-2">
              {deviceIps.map(deviceIp => (
                <motion.div
                  key={deviceIp}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Badge
                    variant={selectedDevices.includes(deviceIp) ? 'default' : 'outline'}
                    className={`cursor-pointer transition-colors ${
                      selectedDevices.includes(deviceIp) 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => handleDeviceSelection(
                      deviceIp, 
                      !selectedDevices.includes(deviceIp)
                    )}
                  >
                    <Server className="h-3 w-3 mr-1" />
                    {deviceIp}
                  </Badge>
                </motion.div>
              ))}
              
              {deviceIps.length === 0 && (
                <div className="text-sm text-gray-500 py-2">
                  暂无可监控的设备
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 状态指示器 */}
      {(isMonitoringActive || isLoading) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200"
        >
          {isLoading && <Loading size="sm" />}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isMonitoringActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`} />
            <span className="text-sm font-medium text-blue-900">
              {isMonitoringActive ? '流量监控进行中' : '监控已暂停'}
            </span>
          </div>
          
          {realtimeActive && (
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <RefreshCw className="h-4 w-4 animate-spin" />
              每 {refreshInterval} 秒刷新
            </div>
          )}
        </motion.div>
      )}

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">错误</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </motion.div>
      )}

      {/* 主内容区域 */}
      <motion.div
        key={viewMode}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {renderViewModeContent()}
      </motion.div>
    </div>
  )
}
