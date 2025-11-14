
import React, { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  Server,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  LoadingOverlay,
  PageLoading,
  LineChartComponent
} from '@/components/atoms'
import {
  useSystemMetrics,
  useSystemHealth,
  useSystemInfo,
  useRestartService,
  useClearCache
} from '../hooks'

const RANGE_OPTIONS = [
  { label: '最近1小时', value: '1h', spanMs: 60 * 60 * 1000, interval: '5m' as const },
  { label: '最近6小时', value: '6h', spanMs: 6 * 60 * 60 * 1000, interval: '15m' as const },
  { label: '最近24小时', value: '24h', spanMs: 24 * 60 * 60 * 1000, interval: '1h' as const }
]

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours} 小时 ${minutes} 分`
}
export const SystemMonitoring: React.FC = () => {
  const [range, setRange] = useState(RANGE_OPTIONS[0])

  const endTime = useMemo(() => new Date(), [])
  const startTime = useMemo(() => new Date(endTime.getTime() - range.spanMs), [endTime, range])

  const metricsQuery = useSystemMetrics({
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    interval: range.interval
  })
  const healthQuery = useSystemHealth()
  const infoQuery = useSystemInfo()
  const restartService = useRestartService()
  const clearCache = useClearCache()

  const overlayActive = metricsQuery.isFetching || healthQuery.isFetching || infoQuery.isFetching || restartService.isPending || clearCache.isPending
  const overlayMessage = restartService.isPending
    ? '正在重启服务...'
    : clearCache.isPending
      ? '正在清理缓存...'
      : '正在刷新监控数据...'

  const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data])
  const health = healthQuery.data
  const systemInfo = infoQuery.data

  const chartData = useMemo(() => {
    return metrics.map(metric => ({
      time: new Date(metric.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      cpu: metric.cpu.usage,
      memory: metric.memory.usage,
      disk: metric.disk.usage
    }))
  }, [metrics])

  const latestMetric = metrics[metrics.length - 1]

  return (
    <LoadingOverlay isLoading={overlayActive} message={overlayActive ? overlayMessage : undefined}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>系统运行概览</CardTitle>
              <CardDescription>实时监控资源使用情况，快速定位潜在风险</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={range.value === option.value ? 'default' : 'outline'}
                  onClick={() => setRange(option)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">系统版本</p>
                  <p className="text-lg font-semibold text-gray-900">{systemInfo?.version || '--'}</p>
                </div>
                <Server className="h-6 w-6 text-purple-500" />
              </div>
              <p className="mt-3 text-xs text-gray-500">{systemInfo?.environment?.toUpperCase()}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">运行时长</p>
                  <p className="text-lg font-semibold text-gray-900">{systemInfo ? formatDuration(systemInfo.uptime) : '--'}</p>
                </div>
                <Activity className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="mt-3 text-xs text-gray-500">启动时间：{systemInfo ? new Date(systemInfo.startTime).toLocaleString() : '--'}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">健康状态</p>
                  <p className="text-lg font-semibold text-gray-900">{health ? (health.overall === 'healthy' ? '正常' : health.overall === 'warning' ? '警告' : '异常') : '--'}</p>
                </div>
                <Badge variant={health?.overall === 'healthy' ? 'success' : health?.overall === 'warning' ? 'warning' : 'danger'} size="sm">
                  {health?.overall || '--'}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-gray-500">告警数量：{health?.alerts.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">请求统计</p>
                  <p className="text-lg font-semibold text-gray-900">{latestMetric?.application.requests ?? '--'}</p>
                </div>
                <Cpu className="h-6 w-6 text-blue-500" />
              </div>
              <p className="mt-3 text-xs text-gray-500">错误数：{latestMetric?.application.errors ?? '--'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>资源使用趋势</CardTitle>
            <CardDescription>CPU、内存与磁盘使用率变化</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {metricsQuery.isLoading ? (
              <PageLoading message="正在加载监控数据..." />
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                暂无监控数据
              </div>
            ) : (
              <LineChartComponent
                data={chartData}
                xKey="time"
                lines={[
                  { key: 'cpu', name: 'CPU', color: '#6366F1', strokeWidth: 2 },
                  { key: 'memory', name: '内存', color: '#22C55E', strokeWidth: 2 },
                  { key: 'disk', name: '磁盘', color: '#F97316', strokeWidth: 2 }
                ]}
                height={320}
                formatter={(value) => `${Number(value).toFixed(1)}%`}
              />
            )}
          </CardContent>
        </Card>

        {health && (
          <Card>
            <CardHeader>
              <CardTitle>关键资源状态</CardTitle>
              <CardDescription>实时监控 CPU / 内存 / 磁盘 / 数据库健康</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'CPU', value: health.resources.cpu.usage, status: health.resources.cpu.status, icon: Cpu },
                { label: '内存', value: health.resources.memory.usage, status: health.resources.memory.status, icon: Activity },
                { label: '磁盘', value: health.resources.disk.usage, status: health.resources.disk.status, icon: HardDrive },
                { label: '数据库连接', value: health.resources.database.connections, status: health.resources.database.status, icon: Server }
              ].map(item => {
                const Icon = item.icon
                const variant: 'success' | 'warning' | 'danger' = item.status === 'normal' ? 'success' : item.status === 'warning' ? 'warning' : 'danger'
                return (
                  <div key={item.label} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {item.label === '数据库连接' ? item.value : formatPercent(item.value)}
                        </p>
                      </div>
                      <Icon className="h-6 w-6 text-purple-500" />
                    </div>
                    <Badge variant={variant} size="sm" className="mt-3">
                      {item.status === 'normal' ? '正常' : item.status === 'warning' ? '警告' : '异常'}
                    </Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {health && (
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>服务运行状态</CardTitle>
                <CardDescription>监控各个核心服务的可用性</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearCache.mutate('all')}
                disabled={clearCache.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />清理缓存
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {health.services.map(service => (
                <div key={service.name} className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{service.name}</p>
                    <p className="text-xs text-gray-500">运行时间：{formatDuration(service.uptime)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={service.status === 'running' ? 'success' : service.status === 'stopped' ? 'outline' : 'danger'} size="sm">
                      {service.status === 'running' ? '运行中' : service.status === 'stopped' ? '已停止' : '异常'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restartService.mutate(service.name)}
                    >
                      重启
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {health?.alerts.length ? (
          <Card>
            <CardHeader>
              <CardTitle>实时告警</CardTitle>
              <CardDescription>关注重要异常与告警信息</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {health.alerts.map((alert, index) => (
                <div key={`${alert.timestamp}-${index}`} className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-yellow-700">{alert.message}</p>
                    <p className="text-xs text-yellow-600 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </LoadingOverlay>
  )
}
