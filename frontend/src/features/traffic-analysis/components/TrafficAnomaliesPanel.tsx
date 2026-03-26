import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  AlertCircle,
  Clock,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Loading,
  Input
} from '@/components/atoms'
import { CompactStatCard } from '@/components/shared'
import { useTrafficAnalysis } from '../hooks/useTrafficAnalysis'
import { TrafficAnomaly, TrafficFilter } from '../types'
import { formatDate, formatBytes } from '@/utils/formatters'

interface TrafficAnomaliesPanelProps {
  deviceIps: string[]
  filter?: TrafficFilter
}

const ANOMALY_TYPE_CONFIG = {
  traffic_spike: {
    icon: TrendingUp,
    label: '流量激增',
    color: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  traffic_drop: {
    icon: TrendingDown,
    label: '流量骤降',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  high_utilization: {
    icon: Zap,
    label: '高利用率',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  high_errors: {
    icon: AlertCircle,
    label: '高错误率',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  }
}

const SEVERITY_CONFIG = {
  low: { color: 'bg-muted text-foreground', label: '低' },
  medium: { color: 'bg-yellow-100 text-yellow-800', label: '中' },
  high: { color: 'bg-orange-100 text-orange-800', label: '高' },
  critical: { color: 'bg-red-100 text-red-800', label: '严重' }
}

const ALL_FILTER_VALUE = '__all__'

export const TrafficAnomaliesPanel: React.FC<TrafficAnomaliesPanelProps> = ({
  deviceIps,
  filter
}) => {
  const [anomalies, setAnomalies] = useState<TrafficAnomaly[]>([])
  const [filteredAnomalies, setFilteredAnomalies] = useState<TrafficAnomaly[]>([])
  const [severityFilter, setSeverityFilter] = useState<string>(filter?.severity ?? '')
  const [typeFilter, setTypeFilter] = useState<string>(filter?.anomaly_type ?? '')
  const [deviceFilter, setDeviceFilter] = useState<string>(filter?.device_ips?.[0] ?? '')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const refreshInterval = 30

  const { isLoading, error, getTrafficAnomalies } = useTrafficAnalysis()
  
  const analysisHours = React.useMemo(() => {
    if (filter?.time_range) {
      const { start, end } = filter.time_range
      const startDate = new Date(start)
      const endDate = new Date(end)
      if (!Number.isNaN(startDate.valueOf()) && !Number.isNaN(endDate.valueOf()) && endDate > startDate) {
        return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)))
      }
    }
    return 24
  }, [filter])
  
  // 加载异常数据
  const loadAnomalies = React.useCallback(async () => {
    try {
      const deviceParam = deviceFilter || filter?.device_ips?.[0]
      const severityParam = severityFilter || filter?.severity
      const anomalyData = await getTrafficAnomalies(
        deviceParam || undefined,
        severityParam || undefined,
        analysisHours
      )
      setAnomalies(anomalyData)
    } catch (error) {
      console.error('Failed to load anomalies:', error)
    }
  }, [analysisHours, deviceFilter, filter, getTrafficAnomalies, severityFilter])

  // 应用过滤器
  useEffect(() => {
    let filtered = [...anomalies]

    // 设备过滤
    if (deviceIps.length > 0) {
      filtered = filtered.filter(anomaly => 
        deviceIps.includes(anomaly.device_ip)
      )
    }

    // 严重程度过滤
    if (severityFilter) {
      filtered = filtered.filter(anomaly => 
        anomaly.severity === severityFilter
      )
    }

    // 类型过滤
    if (typeFilter) {
      filtered = filtered.filter(anomaly => 
        anomaly.anomaly_type === typeFilter
      )
    }

    // 设备IP过滤
    if (deviceFilter) {
      filtered = filtered.filter(anomaly => 
        anomaly.device_ip.includes(deviceFilter)
      )
    }

    setFilteredAnomalies(filtered)
  }, [anomalies, deviceIps, severityFilter, typeFilter, deviceFilter])

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(loadAnomalies, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadAnomalies])

  // 初始加载
  useEffect(() => {
    loadAnomalies()
  }, [loadAnomalies])

  useEffect(() => {
    if (!filter) return
    if (filter.severity !== undefined) {
      setSeverityFilter(filter.severity)
    }
    if (filter.anomaly_type !== undefined) {
      setTypeFilter(filter.anomaly_type)
    }
    if (filter.device_ips && filter.device_ips.length > 0) {
      setDeviceFilter(filter.device_ips[0])
    }
  }, [filter])

  // 统计数据
  const stats = {
    total: filteredAnomalies.length,
    critical: filteredAnomalies.filter(a => a.severity === 'critical').length,
    high: filteredAnomalies.filter(a => a.severity === 'high').length,
    medium: filteredAnomalies.filter(a => a.severity === 'medium').length,
    low: filteredAnomalies.filter(a => a.severity === 'low').length,
    recent: filteredAnomalies.filter(a => 
      new Date(a.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
    ).length
  }

  const renderStatsCards = () => (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
      <CompactStatCard
        title="总异常"
        value={stats.total}
        icon={AlertTriangle}
        iconClassName="text-blue-600 dark:text-blue-400"
        valueClassName="text-blue-600 dark:text-blue-400"
      />
      <CompactStatCard
        title="严重"
        value={stats.critical}
        icon={Zap}
        iconClassName="text-red-600 dark:text-red-400"
        valueClassName="text-red-600 dark:text-red-400"
      />
      <CompactStatCard
        title="高"
        value={stats.high}
        icon={TrendingUp}
        iconClassName="text-orange-600 dark:text-orange-400"
        valueClassName="text-orange-600 dark:text-orange-400"
      />
      <CompactStatCard
        title="中"
        value={stats.medium}
        icon={AlertCircle}
        iconClassName="text-yellow-600 dark:text-yellow-400"
        valueClassName="text-yellow-600 dark:text-yellow-400"
      />
      <CompactStatCard
        title="低"
        value={stats.low}
        icon={TrendingDown}
        iconClassName="text-muted-foreground"
        valueClassName="text-muted-foreground"
      />
      <CompactStatCard
        title="近1小时"
        value={stats.recent}
        icon={Clock}
        iconClassName="text-green-600 dark:text-green-400"
        valueClassName="text-green-600 dark:text-green-400"
      />
    </div>
  )

  const renderFilters = () => (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-wrap gap-3">
            {/* 严重程度过滤 */}
            <Select
              value={severityFilter || ALL_FILTER_VALUE}
              onValueChange={value => setSeverityFilter(value === ALL_FILTER_VALUE ? '' : value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="严重程度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>全部</SelectItem>
                <SelectItem value="critical">严重</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>

            {/* 异常类型过滤 */}
            <Select
              value={typeFilter || ALL_FILTER_VALUE}
              onValueChange={value => setTypeFilter(value === ALL_FILTER_VALUE ? '' : value)}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="异常类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                <SelectItem value="traffic_spike">流量激增</SelectItem>
                <SelectItem value="traffic_drop">流量骤降</SelectItem>
                <SelectItem value="high_utilization">高利用率</SelectItem>
                <SelectItem value="high_errors">高错误率</SelectItem>
              </SelectContent>
            </Select>

            {/* 设备过滤 */}
            <Input
              placeholder="搜索设备IP"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* 自动刷新开关 */}
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              自动刷新
            </Button>

            {/* 手动刷新 */}
            <Button
              variant="outline"
              size="sm"
              onClick={loadAnomalies}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderAnomalyCard = (anomaly: TrafficAnomaly, index: number) => {
    const typeConfig = ANOMALY_TYPE_CONFIG[anomaly.anomaly_type]
    const severityConfig = SEVERITY_CONFIG[anomaly.severity]
    const IconComponent = typeConfig?.icon || AlertTriangle

    return (
      <motion.div
        key={`${anomaly.device_ip}-${anomaly.interface}-${anomaly.timestamp}-${index}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
      >
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${typeConfig?.color || 'bg-muted text-foreground'}`}>
                  <IconComponent className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{anomaly.device_ip}</h4>
                  <p className="text-sm text-muted-foreground">{anomaly.interface}</p>
                </div>
              </div>
              <div className="text-right">
                <Badge className={severityConfig.color}>
                  {severityConfig.label}
                </Badge>
                <div className="text-xs text-gray-500 mt-1">
                  {formatDate(anomaly.timestamp, 'datetime')}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-gray-800">{anomaly.description}</div>
              
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>基线值: {formatBytes(anomaly.baseline_value)}</span>
                <span>当前值: {formatBytes(anomaly.current_value)}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">
                  置信度: {(anomaly.confidence * 100).toFixed(1)}%
                </span>
                <Badge variant="outline" className="text-xs">
                  {typeConfig?.label || anomaly.anomaly_type}
                </Badge>
              </div>

              {/* 元数据信息 */}
              {Object.keys(anomaly.metadata).length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-gray-800">
                      详细信息
                    </summary>
                    <div className="mt-1 space-y-1">
                      {Object.entries(anomaly.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-500">{key}:</span>
                          <span className="text-foreground/80">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {renderStatsCards()}

      {/* 过滤器 */}
      {renderFilters()}

      {/* 异常列表 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">流量异常详情</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            实时更新
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loading />
          </div>
        ) : filteredAnomalies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAnomalies.map((anomaly, index) => renderAnomalyCard(anomaly, index))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">暂无异常</h3>
              <p className="text-muted-foreground">
                {anomalies.length === 0 
                  ? '当前没有检测到流量异常' 
                  : '当前筛选条件下无匹配的异常'
                }
              </p>
              {anomalies.length === 0 && (
                <Button 
                  onClick={loadAnomalies} 
                  className="mt-4"
                  disabled={isLoading}
                >
                  刷新数据
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">加载异常时出错</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </motion.div>
      )}
    </div>
  )
}
