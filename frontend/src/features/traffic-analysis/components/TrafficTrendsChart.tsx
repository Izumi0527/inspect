// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Loading,
  LineChartComponent,
  AreaChartComponent
} from '@/components/atoms'
import { useTrafficAnalysis } from '../hooks/useTrafficAnalysis'
import { TrafficTrend } from '../types'
import { formatBytes } from '@/utils/formatters'
import { TrendingUp, TrendingDown, BarChart3, Zap } from 'lucide-react'

interface TrafficTrendsChartProps {
  deviceIps: string[]
  timeRange: {
    start: string
    end: string
  }
}

type ChartType = 'line' | 'area'
type MetricType = 'traffic' | 'utilization' | 'trend'

export const TrafficTrendsChart: React.FC<TrafficTrendsChartProps> = ({
  deviceIps,
  timeRange
}) => {
  const [trends, setTrends] = useState<Record<string, TrafficTrend[]>>({})
  const [chartType, setChartType] = useState<ChartType>('line')
  const [metricType, setMetricType] = useState<MetricType>('traffic')
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [analysisHours, setAnalysisHours] = useState(24)

  useEffect(() => {
    const start = new Date(timeRange.start)
    const end = new Date(timeRange.end)
    if (!Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && end > start) {
      const diffHours = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)))
      if (diffHours !== analysisHours) {
        setAnalysisHours(diffHours)
      }
    }
  }, [timeRange.start, timeRange.end, analysisHours])

  const { isLoading, error, getTrafficTrends } = useTrafficAnalysis()

  // 加载趋势数据
  const loadTrends = useCallback(async () => {
    if (deviceIps.length === 0) return

    const trendsData: Record<string, TrafficTrend[]> = {}
    
    for (const deviceIp of deviceIps) {
      try {
        const deviceTrends = await getTrafficTrends(deviceIp, analysisHours)
        trendsData[deviceIp] = deviceTrends
      } catch (error) {
        console.error(`Failed to load trends for ${deviceIp}:`, error)
      }
    }
    
    setTrends(trendsData)
  }, [analysisHours, deviceIps, getTrafficTrends])

  useEffect(() => {
    loadTrends()
  }, [loadTrends])

  useEffect(() => {
    if (selectedDevice === '' && deviceIps.length > 0) {
      setSelectedDevice(deviceIps[0])
    }
  }, [deviceIps, selectedDevice])

  // 准备图表数据
  const chartData = useMemo(() => {
    const selectedTrends = trends[selectedDevice] || []
    
    return selectedTrends.map(trend => ({
      interface: trend.interface,
      current_in: trend.current_in,
      current_out: trend.current_out,
      current_utilization: trend.current_utilization,
      avg_in: trend.avg_in,
      avg_out: trend.avg_out,
      avg_utilization: trend.avg_utilization,
      peak_in: trend.peak_in,
      peak_out: trend.peak_out,
      peak_utilization: trend.peak_utilization,
      trend_in: trend.trend_in,
      trend_out: trend.trend_out,
      trend_utilization: trend.trend_utilization
    }))
  }, [trends, selectedDevice])

  // 计算整体统计
  const statistics = useMemo(() => {
    if (!chartData.length) return null

    const totalCurrentIn = chartData.reduce((sum, data) => sum + data.current_in, 0)
    const totalCurrentOut = chartData.reduce((sum, data) => sum + data.current_out, 0)
    const avgUtilization = chartData.reduce((sum, data) => sum + data.current_utilization, 0) / chartData.length
    const maxUtilization = Math.max(...chartData.map(data => data.current_utilization))
    
    const trendingUp = chartData.filter(data => 
      data.trend_in > 0 || data.trend_out > 0 || data.trend_utilization > 0
    ).length
    const trendingDown = chartData.filter(data => 
      data.trend_in < 0 || data.trend_out < 0 || data.trend_utilization < 0
    ).length

    return {
      totalCurrentIn,
      totalCurrentOut,
      avgUtilization,
      maxUtilization,
      trendingUp,
      trendingDown,
      interfaceCount: chartData.length
    }
  }, [chartData])

  const renderStatisticsCards = () => {
    if (!statistics) return null

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">当前入向流量</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatBytes(statistics.totalCurrentIn)}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">当前出向流量</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatBytes(statistics.totalCurrentOut)}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">平均利用率</p>
                  <p className="text-lg font-bold text-orange-600">
                    {statistics.avgUtilization.toFixed(1)}%
                  </p>
                </div>
                <div className="p-2 bg-orange-100 rounded">
                  <BarChart3 className="h-4 w-4 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">峰值利用率</p>
                  <p className={`text-lg font-bold ${
                    statistics.maxUtilization > 90 ? 'text-red-600' :
                    statistics.maxUtilization > 80 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {statistics.maxUtilization.toFixed(1)}%
                  </p>
                </div>
                <div className="p-2 bg-purple-100 rounded">
                  <Zap className="h-4 w-4 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  const renderTrafficChart = () => {
    // 根据 metricType 和 chartType 配置数据系列
    const getChartConfig = () => {
      if (metricType === 'traffic') {
        if (chartType === 'area') {
          return {
            areas: [
              { key: 'current_in', name: '当前入向', color: '#2563eb' },
              { key: 'current_out', name: '当前出向', color: '#059669' }
            ]
          }
        } else {
          return {
            lines: [
              { key: 'current_in', name: '当前入向', color: '#2563eb', strokeWidth: 2 },
              { key: 'current_out', name: '当前出向', color: '#059669', strokeWidth: 2 },
              { key: 'avg_in', name: '平均入向', color: '#2563eb', strokeWidth: 1 },
              { key: 'avg_out', name: '平均出向', color: '#059669', strokeWidth: 1 }
            ]
          }
        }
      } else if (metricType === 'utilization') {
        if (chartType === 'area') {
          return {
            areas: [
              { key: 'current_utilization', name: '当前利用率', color: '#d97706' }
            ]
          }
        } else {
          return {
            lines: [
              { key: 'current_utilization', name: '当前利用率', color: '#d97706', strokeWidth: 2 },
              { key: 'avg_utilization', name: '平均利用率', color: '#d97706', strokeWidth: 1 }
            ]
          }
        }
      } else { // trend
        return {
          lines: [
            { key: 'trend_in', name: '入向趋势', color: '#7c3aed', strokeWidth: 2 },
            { key: 'trend_out', name: '出向趋势', color: '#db2777', strokeWidth: 2 }
          ]
        }
      }
    }

    const config = getChartConfig()

    return (
      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {metricType === 'traffic' ? '流量趋势' :
               metricType === 'utilization' ? '利用率趋势' : '趋势分析'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={metricType} onValueChange={(value: string) => setMetricType(value as MetricType)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="traffic">流量</SelectItem>
                  <SelectItem value="utilization">利用率</SelectItem>
                  <SelectItem value="trend">趋势</SelectItem>
                </SelectContent>
              </Select>
              <Select value={chartType} onValueChange={(value: string) => setChartType(value as ChartType)}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">线图</SelectItem>
                  <SelectItem value="area">面积图</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            {chartData.length > 0 ? (
              chartType === 'area' && 'areas' in config ? (
                <AreaChartComponent
                  data={chartData}
                  xKey="interface"
                  areas={config.areas}
                  height={320}
                  formatter={(value) =>
                    metricType === 'utilization' ? `${value}%` : formatBytes(Number(value))
                  }
                />
              ) : 'lines' in config ? (
                <LineChartComponent
                  data={chartData}
                  xKey="interface"
                  lines={config.lines}
                  height={320}
                  formatter={(value) =>
                    metricType === 'utilization' ? `${value}%` : formatBytes(Number(value))
                  }
                />
              ) : null
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <div className="text-lg font-medium mb-2">暂无趋势数据</div>
                  <div className="text-sm">请选择设备并等待数据采集</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderTrendTable = () => (
    <Card>
      <CardHeader>
        <CardTitle>接口详情</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {chartData.map(trend => (
              <div 
                key={trend.interface} 
                className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{trend.interface}</span>
                  <Badge variant="outline" className="text-xs">
                    {trend.current_utilization.toFixed(1)}% 利用率
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <div>当前入向: {formatBytes(trend.current_in)}</div>
                    <div>当前出向: {formatBytes(trend.current_out)}</div>
                  </div>
                  <div>
                    <div>峰值入向: {formatBytes(trend.peak_in)}</div>
                    <div>峰值出向: {formatBytes(trend.peak_out)}</div>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <span className={`flex items-center gap-1 ${
                      trend.trend_in > 0 ? 'text-red-600' : trend.trend_in < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {trend.trend_in > 0 ? <TrendingUp className="h-3 w-3" /> : 
                       trend.trend_in < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                      入向趋势
                    </span>
                    <span className={`flex items-center gap-1 ${
                      trend.trend_out > 0 ? 'text-red-600' : trend.trend_out < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {trend.trend_out > 0 ? <TrendingUp className="h-3 w-3" /> : 
                       trend.trend_out < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                      出向趋势
                    </span>
                  </div>
                  <span className={`${
                    trend.current_utilization > 90 ? 'text-red-600' :
                    trend.current_utilization > 80 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {trend.current_utilization > 90 ? '高负载' :
                     trend.current_utilization > 80 ? '中负载' : '正常'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            暂无接口数据
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* 控制栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Select 
                value={selectedDevice} 
                onValueChange={setSelectedDevice}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="选择设备" />
                </SelectTrigger>
                <SelectContent>
                  {deviceIps.map(deviceIp => (
                    <SelectItem key={deviceIp} value={deviceIp}>
                      {deviceIp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={analysisHours.toString()} 
                onValueChange={(value) => setAnalysisHours(parseInt(value))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1小时</SelectItem>
                  <SelectItem value="6">6小时</SelectItem>
                  <SelectItem value="24">24小时</SelectItem>
                  <SelectItem value="168">7天</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={loadTrends} disabled={isLoading} size="sm">
              {isLoading ? <Loading size="sm" /> : '刷新数据'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      {renderStatisticsCards()}

      {/* 图表区域 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {renderTrafficChart()}
        {renderTrendTable()}
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-red-800">
              <strong>数据加载错误：</strong>{error}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
