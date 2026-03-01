import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  Server,
  Wifi,
  AlertTriangle,
  Clock,
  Network,
  BarChart3
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Loading
} from '@/components/atoms'
import { useTrafficAnalysis } from '../hooks/useTrafficAnalysis'
import { TrafficSummary } from '../types'
import { formatBytes, formatDate } from '@/utils/formatters'

interface TrafficSummaryCardsProps {
  deviceIps: string[]
}

export const TrafficSummaryCards: React.FC<TrafficSummaryCardsProps> = ({
  deviceIps
}) => {
  const [summary, setSummary] = useState<TrafficSummary | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { isLoading, error, getTrafficSummary } = useTrafficAnalysis()

  const loadSummary = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const summaryData = await getTrafficSummary(deviceIps.length > 0 ? deviceIps : undefined)
      setSummary(summaryData)
    } catch (error) {
      console.error('Failed to load traffic summary:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [deviceIps, getTrafficSummary])

  useEffect(() => {
    loadSummary()
    
    // 自动刷新
    const interval = setInterval(loadSummary, 60000) // 1分钟
    return () => clearInterval(interval)
  }, [loadSummary])

  if (isLoading && !summary) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading />
      </div>
    )
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">暂无流量数据</h3>
          <p className="text-muted-foreground">请开始监控设备以查看流量汇总信息</p>
        </CardContent>
      </Card>
    )
  }

  const renderOverviewCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">监控设备</p>
                <p className="text-3xl font-bold text-blue-600">{summary.total_devices}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Server className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">网络接口</p>
                <p className="text-3xl font-bold text-green-600">{summary.total_interfaces}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Network className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">活跃异常</p>
                <p className="text-3xl font-bold text-orange-600">{summary.active_anomalies}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">基线模式</p>
                <p className="text-3xl font-bold text-purple-600">{summary.baseline_patterns}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )

  const renderDeviceCards = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">设备详情</h3>
        {isRefreshing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loading size="sm" />
            更新中...
          </div>
        )}
      </div>

      {Object.keys(summary.devices).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            暂无设备流量数据
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(summary.devices).map(([deviceIp, deviceData], index) => (
            <motion.div
              key={deviceIp}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (index + 1) }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium">
                      {deviceIp}
                    </CardTitle>
                    <Badge variant="outline">
                      {deviceData.interface_count} 接口
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 接口列表 */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground/80">网络接口</h4>
                    <div className="space-y-2">
                      {Object.entries(deviceData.interfaces).map(([interfaceName, interfaceData]) => (
                        <div key={interfaceName} className="flex items-center justify-between p-2 bg-muted/40 rounded">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{interfaceName}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-medium text-foreground">
                              {interfaceData.avg_utilization.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatBytes(interfaceData.total_bytes)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 统计信息 */}
                  <div className="pt-3 border-t">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">样本数量</div>
                        <div className="font-medium">{deviceData.sample_count}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">最后更新</div>
                        <div className="font-medium text-xs">
                          {formatDate(deviceData.last_update, 'datetime')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 状态指示 */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-muted-foreground">实时监控</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        在线
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )

  const calculateAverageUtilization = () => {
    let totalUtilization = 0
    let interfaceCount = 0

    Object.values(summary.devices).forEach(deviceData => {
      Object.values(deviceData.interfaces).forEach(interfaceData => {
        totalUtilization += interfaceData.avg_utilization
        interfaceCount++
      })
    })

    return interfaceCount > 0 ? (totalUtilization / interfaceCount) : 0
  }

  const getHealthStatus = () => {
    const avgUtilization = calculateAverageUtilization()
    if (avgUtilization > 80) return { status: 'warning', color: 'text-orange-600', label: '高负载' }
    if (avgUtilization > 60) return { status: 'medium', color: 'text-yellow-600', label: '中等负载' }
    return { status: 'good', color: 'text-green-600', label: '正常' }
  }

  const healthStatus = getHealthStatus()

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      {renderOverviewCards()}

      {/* 整体健康状态 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-gradient-to-r from-blue-50 to-cyan-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">网络健康状态</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      healthStatus.status === 'good' ? 'bg-green-500' :
                      healthStatus.status === 'medium' ? 'bg-yellow-500' : 'bg-orange-500'
                    }`} />
                    <span className={`font-medium ${healthStatus.color}`}>
                      {healthStatus.label}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    平均利用率: {calculateAverageUtilization().toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-foreground">
                  {summary.total_devices}
                </div>
                <div className="text-sm text-muted-foreground">设备在线</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 设备详情卡片 */}
      {renderDeviceCards()}

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">数据加载错误</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </motion.div>
      )}
    </div>
  )
}
