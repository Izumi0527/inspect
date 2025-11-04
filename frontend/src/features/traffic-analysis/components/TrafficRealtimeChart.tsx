import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import type { TooltipProps } from 'recharts'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge
} from '@/components/atoms'
import { TrafficMetrics } from '../types'
import { formatBytes, formatDate } from '@/utils/formatters'

interface TrafficRealtimeChartProps {
  trafficData: Record<string, TrafficMetrics[]>
  isActive: boolean
}

export const TrafficRealtimeChart: React.FC<TrafficRealtimeChartProps> = ({
  trafficData,
  isActive
}) => {
  // 准备图表数据
  const chartData = useMemo(() => {
    const allMetrics: Array<TrafficMetrics & { device: string }> = []
    
    Object.entries(trafficData).forEach(([deviceIp, metrics]) => {
      metrics.forEach(metric => {
        allMetrics.push({
          ...metric,
          device: deviceIp
        })
      })
    })
    
    // 按时间戳排序并限制数据点数量
    return allMetrics
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-50) // 只显示最近50个数据点
  }, [trafficData])

  type LineChartDatum = {
    timestamp: string
    [key: string]: number | string
  }

  // 按设备和接口分组准备多线图数据
  const lineChartData = useMemo(() => {
    const dataMap = new Map<string, LineChartDatum>()

    chartData.forEach(metric => {
      const timeKey = formatDate(metric.timestamp, 'time')

      if (!dataMap.has(timeKey)) {
        dataMap.set(timeKey, { timestamp: timeKey })
      }

      const data = dataMap.get(timeKey)!
      const deviceInterface = `${metric.device}-${metric.interface}`

      data[`${deviceInterface}_in`] = metric.bytes_in
      data[`${deviceInterface}_out`] = metric.bytes_out
      data[`${deviceInterface}_util`] = metric.bandwidth_utilization
    })

    return Array.from(dataMap.values()).slice(-20) // 显示最近20个时间点
  }, [chartData])

  // 获取所有设备接口的列表，用于生成不同颜色的线条
  const deviceInterfaces = useMemo(() => {
    const interfaces = new Set<string>()
    chartData.forEach(metric => {
      interfaces.add(`${metric.device}-${metric.interface}`)
    })
    return Array.from(interfaces)
  }, [chartData])

  // 颜色配置
  const colors = [
    '#2563eb', '#dc2626', '#059669', '#d97706', 
    '#7c3aed', '#db2777', '#0891b2', '#65a30d'
  ]

  const normalizeMetricValue = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
    return 0
  }

  const trafficTooltipFormatter: TooltipProps<number, string>['formatter'] = (value, name) => {
    const numericValue = normalizeMetricValue(value)
    const label = typeof name === 'string' ? name : ''
    const isUtil = label.includes('_util')
    const displayValue = isUtil ? `${numericValue}%` : formatBytes(numericValue)
    const displayLabel = isUtil ? '利用率' : label.includes('_in') ? '入向流量' : '出向流量'
    return [displayValue, displayLabel]
  }

  const utilizationTooltipFormatter: TooltipProps<number, string>['formatter'] = (value) => {
    const numericValue = normalizeMetricValue(value)
    return [`${numericValue}%`, '利用率']
  }

  const renderTrafficChart = () => (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            流量趋势
            {isActive && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {Object.keys(trafficData).length} 设备
            </Badge>
            <Badge variant="outline">
              实时监控
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          {lineChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => formatBytes(value)}
                />
                <Tooltip
                  formatter={trafficTooltipFormatter}
                  labelFormatter={(label) => `时间: ${label}`}
                />
                <Legend />
                
                {deviceInterfaces.map((deviceInterface, index) => (
                  <React.Fragment key={deviceInterface}>
                    <Line
                      type="monotone"
                      dataKey={`${deviceInterface}_in`}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2}
                      dot={false}
                      name={`${deviceInterface} 入向`}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={`${deviceInterface}_out`}
                      stroke={colors[(index + 1) % colors.length]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name={`${deviceInterface} 出向`}
                      connectNulls={false}
                    />
                  </React.Fragment>
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">暂无流量数据</div>
                <div className="text-sm">请选择设备并开始监控</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const renderUtilizationChart = () => (
    <Card>
      <CardHeader>
        <CardTitle>带宽利用率</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {lineChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  formatter={utilizationTooltipFormatter}
                  labelFormatter={(label) => `时间: ${label}`}
                />
                <Legend />
                
                {/* 利用率警戒线 */}
                <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="5 5" />
                <ReferenceLine y={90} stroke="#dc2626" strokeDasharray="5 5" />
                
                {deviceInterfaces.map((deviceInterface, index) => (
                  <Line
                    key={deviceInterface}
                    type="monotone"
                    dataKey={`${deviceInterface}_util`}
                    stroke={colors[index % colors.length]}
                    strokeWidth={2}
                    dot={false}
                    name={deviceInterface}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              暂无利用率数据
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const renderCurrentMetrics = () => {
    if (Object.keys(trafficData).length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            暂无实时指标数据
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(trafficData).map(([deviceIp, metrics]) =>
          metrics.map(metric => (
            <motion.div
              key={`${deviceIp}-${metric.interface}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {deviceIp}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {metric.interface}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-gray-600">入向</div>
                      <div className="font-medium text-blue-600">
                        {formatBytes(metric.bytes_in)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">出向</div>
                      <div className="font-medium text-green-600">
                        {formatBytes(metric.bytes_out)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">利用率</span>
                      <span className={`font-medium ${
                        metric.bandwidth_utilization > 90 ? 'text-red-600' :
                        metric.bandwidth_utilization > 80 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {metric.bandwidth_utilization.toFixed(1)}%
                      </span>
                    </div>
                    
                    {(metric.errors > 0 || metric.discards > 0) && (
                      <div className="mt-1 text-xs text-red-600">
                        错误: {metric.errors}, 丢弃: {metric.discards}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 图表区域 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {renderTrafficChart()}
        {renderUtilizationChart()}
      </div>
      
      {/* 实时指标卡片 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">实时指标</h3>
        {renderCurrentMetrics()}
      </div>
    </div>
  )
}