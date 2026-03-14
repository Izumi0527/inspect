'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMonitoringV2 } from '../hooks/useMonitoringV2'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { StatCard } from '@/components/shared'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/atoms'
import { useWebSocket, useWebSocketEvent, WebSocketEvents } from '@/lib/websocket'
import {
  Server,
  Activity,
  AlertTriangle,
  ShieldOff,
  Cpu,
  HardDrive,
  Network,
  RefreshCw,
  WifiOff,
  DatabaseZap,
  TrendingUp,
  BarChart3,
  Radio,
} from 'lucide-react'
import { DeviceStatusCard, AvailabilityCard, RealTimeAlertsCard } from './cards'
import {
  SystemPerformanceChartWrapper,
  TemperatureChartWrapper,
  NetworkTrafficChartWrapper,
  ChartSkeleton,
} from './charts'
import { useInView } from '@/hooks'
import { ReportExportButton } from './ReportExportButton'

// 图标映射
const monitoringIconMap = {
  total_devices: Server,
  availability: Activity,
  active_alerts: AlertTriangle,
  avg_cpu: Cpu,
  avg_memory: HardDrive,
  avg_network: Network,
}

// 图标颜色映射
const monitoringIconColorMap = {
  total_devices: 'text-blue-600',
  availability: 'text-green-600',
  active_alerts: 'text-red-600',
  avg_cpu: 'text-purple-600',
  avg_memory: 'text-orange-600',
  avg_network: 'text-cyan-600',
}

const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '近24小时' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
]

function resolveTimeRangeLabel(timeRange: string): string {
  const resolved = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label
  if (resolved) return resolved
  return timeRange
}

/**
 * 区域标题组件 — 为每个 section 提供视觉锚点
 */
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground dark:text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}

function SectionFailureContent({
  title,
  message,
  onRetry,
  className,
}: {
  title: string
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className ?? ''}`}>
      <WifiOff className="h-6 w-6 text-red-600 dark:text-red-400" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry} className="mt-3 cursor-pointer">
        <RefreshCw className="mr-2 h-4 w-4" />
        重试
      </Button>
    </div>
  )
}

function SectionFailureCard({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="border-2 border-dashed border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10">
      <CardContent className="p-6">
        <SectionFailureContent title={title} message={message} onRetry={onRetry} />
      </CardContent>
    </Card>
  )
}

function SectionPermissionLimitedCard({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <Card className="border-2 border-dashed border-border bg-muted/40 dark:border-border dark:bg-muted/40">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function MonitoringView() {
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const canExportReport = usePermission(Permission.MONITORING_EXPORT)
  const canReadAlerts = usePermission(Permission.ALERTS_READ)
  const ws = useWebSocket()
  const [wsConnected, setWsConnected] = useState(() => ws.isConnected())
  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window === 'undefined') return '24h'
    const stored = window.localStorage.getItem('monitoring:timeRange')
    if (stored && TIME_RANGE_OPTIONS.some((item) => item.value === stored)) {
      return stored
    }
    return '24h'
  })
  const timeRangeLabel = useMemo(() => resolveTimeRangeLabel(timeRange), [timeRange])
  const [pageVisible, setPageVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })
  const refetchRef = useRef<null | (() => unknown)>(null)
  const lastWsConnectRefetchAtRef = useRef<number>(0)

  // 页面不可见时暂停轮询：降低无意义的后台刷新；返回页面时 React Query 会因 focus 自动 refetch。
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== 'hidden')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('monitoring:timeRange', timeRange)
  }, [timeRange])

  const subscribeDeviceMonitoring = useCallback(() => {
    if (!ws.isConnected()) return
    ws.subscribeToDeviceMonitoring()
  }, [ws])

  const subscribeAlertsRoom = useCallback(() => {
    if (!canReadAlerts) return
    if (!ws.isConnected()) return
    ws.subscribeToAlerts()
  }, [canReadAlerts, ws])

  const handleWsConnect = useCallback(() => {
    setWsConnected(true)
    // 页面不可见时不订阅房间，避免后台接收推送与触发刷新；返回页面时会在可见性 effect 中重新订阅。
    if (!pageVisible) return
    subscribeDeviceMonitoring()
    subscribeAlertsRoom()

    // WS 连接建立后主动触发一次首轮刷新，避免“连接成功但短期无推送”导致页面长期不更新。
    const now = Date.now()
    if (now - lastWsConnectRefetchAtRef.current >= 15_000) {
      lastWsConnectRefetchAtRef.current = now
      void refetchRef.current?.()
    }
  }, [pageVisible, subscribeAlertsRoom, subscribeDeviceMonitoring])

  const handleWsDisconnect = useCallback(() => {
    setWsConnected(false)
  }, [])

  // WebSocket 连接/断开状态监听（用于轮询兜底开关 + 重连后重新订阅）
  useWebSocketEvent(WebSocketEvents.CONNECT, handleWsConnect)
  useWebSocketEvent(WebSocketEvents.DISCONNECT, handleWsDisconnect)

  const {
    data: envelope,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useMonitoringV2({
    timeRange,
    // WebSocket 连接时优先由推送触发刷新；断线时启用轮询兜底
    enablePolling: !wsConnected && pageVisible,
    refetchInterval: 120000,
  })
  refetchRef.current = refetch

  const data = envelope?.data
  const lastUpdateLabel = useMemo(() => {
    const raw = envelope?.lastUpdate
    if (!raw) return null

    const date = raw instanceof Date ? raw : new Date(String(raw))
    if (Number.isNaN(date.getTime())) {
      const fallback = String(raw).trim()
      return fallback !== '' ? fallback : null
    }
    return date.toLocaleString()
  }, [envelope?.lastUpdate])
  const failedSections = envelope?.failedSections ?? []
  const realtimeAlertsPermissionLimited =
    !canReadAlerts || envelope?.sections.realtimeAlerts?.limitedByPermission === true
  const effectiveFailedSections = realtimeAlertsPermissionLimited
    ? failedSections.filter((section) => section !== 'realtimeAlerts')
    : failedSections
  const hasEffectivePartialFailure = effectiveFailedSections.length > 0

  // 页面级订阅：进入监控中心才订阅 device_metrics，离开页面即退订，降低无关推送开销。
  useEffect(() => {
    if (!pageVisible) {
      if (!ws.isConnected()) return
      ws.unsubscribeFromDeviceMonitoring()
      if (canReadAlerts) {
        ws.unsubscribeFromAlerts()
      }
      return
    }

    subscribeDeviceMonitoring()
    subscribeAlertsRoom()

    return () => {
      if (!ws.isConnected()) return
      ws.unsubscribeFromDeviceMonitoring()
      if (canReadAlerts) {
        ws.unsubscribeFromAlerts()
      }
    }
  }, [canReadAlerts, pageVisible, subscribeAlertsRoom, subscribeDeviceMonitoring, ws])

  // 推送触发“受控刷新”：合并同一轮采集产生的爆发推送，避免 refetch 风暴。
  // - debounce：等待推送“安静”一小段时间再刷新，尽量一次性拿到同一轮采集的完整数据
  // - max wait：防止持续推送导致永不刷新（兜底定时触发一次）
  // 经验值：将刷新频率控制在“约 1 次/分钟”量级，既接近实时又避免对后端造成额外压力。
  const REFRESH_DEBOUNCE_MS = 10_000
  const REFRESH_MAX_WAIT_MS = 60_000

  const firstRealtimeEventAtRef = useRef<number | null>(null)
  const scheduledRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetchDebounced = useCallback(() => {
    const now = Date.now()
    if (firstRealtimeEventAtRef.current === null) {
      firstRealtimeEventAtRef.current = now
    }

    const run = () => {
      firstRealtimeEventAtRef.current = null
      scheduledRefetchTimerRef.current = null
      void refetch()
    }

    if (now - firstRealtimeEventAtRef.current >= REFRESH_MAX_WAIT_MS) {
      if (scheduledRefetchTimerRef.current) {
        clearTimeout(scheduledRefetchTimerRef.current)
        scheduledRefetchTimerRef.current = null
      }
      run()
      return
    }

    if (scheduledRefetchTimerRef.current) {
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }

    scheduledRefetchTimerRef.current = setTimeout(run, REFRESH_DEBOUNCE_MS)
  }, [refetch])

  useEffect(() => {
    return () => {
      if (!scheduledRefetchTimerRef.current) return
      clearTimeout(scheduledRefetchTimerRef.current)
      scheduledRefetchTimerRef.current = null
    }
  }, [])

  // 页面不可见时清理“受控刷新”定时器，避免后台触发 refetch。
  useEffect(() => {
    if (pageVisible) return

    firstRealtimeEventAtRef.current = null
    if (!scheduledRefetchTimerRef.current) return
    clearTimeout(scheduledRefetchTimerRef.current)
    scheduledRefetchTimerRef.current = null
  }, [pageVisible])

  // 注意：后端 device_metrics 推送会映射为多个事件，这里只监听一个，避免重复刷新。
  const handleRealtimeRefresh = useCallback((_payload: unknown) => {
    if (!pageVisible) return
    refetchDebounced()
  }, [pageVisible, refetchDebounced])

  useWebSocketEvent(WebSocketEvents.NETWORK_STATS_UPDATE, handleRealtimeRefresh)

  const handleAlertRealtimeRefresh = useCallback((_payload: unknown) => {
    if (!canReadAlerts) return
    if (!pageVisible) return
    refetchDebounced()
  }, [canReadAlerts, pageVisible, refetchDebounced])

  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleAlertRealtimeRefresh)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleAlertRealtimeRefresh)

  const chartInViewOptions = useMemo(
    () => ({ threshold: 0.1, triggerOnce: true, rootMargin: '100px' }),
    []
  )
  const networkInViewOptions = useMemo(
    () => ({ threshold: 0.1, triggerOnce: true, rootMargin: '100px' }),
    []
  )

  const { ref: chartsRef, inView: chartsInView } = useInView(chartInViewOptions)
  const { ref: networkRef, inView: networkInView } = useInView(networkInViewOptions)

  // ==================== 加载状态 ====================
  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="p-5">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse border-l-[3px] border-l-gray-300 dark:border-l-gray-600">
                    <CardContent className="p-5">
                      <div className="h-3 w-14 rounded bg-muted" />
                      <div className="mt-3 h-7 w-20 rounded bg-muted" />
                      <div className="mt-2 h-3 w-16 rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-5 w-32 rounded bg-muted" />
                      <div className="mt-2 h-4 w-48 rounded bg-muted" />
                      <ChartSkeleton height={280} className="mt-4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ==================== 错误状态 ====================
  if (error) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="flex h-[calc(100vh-80px)] items-center justify-center p-5">
            <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <WifiOff className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-100">
                数据加载失败
              </h3>
              <p className="mb-5 text-sm text-red-700 dark:text-red-300">
                {error.message || '无法连接到监控服务器'}
              </p>
              <Button variant="outline" onClick={() => refetch()} className="cursor-pointer">
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ==================== 无数据状态 ====================
  if (!data) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="flex h-[calc(100vh-80px)] items-center justify-center">
            <div className="text-center">
              <DatabaseZap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/80" />
              <p className="text-muted-foreground">无法加载监控数据</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath="/monitoring"
      />

      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        <DashboardHeader
          title="监控中心"
          alertCount={
            canReadAlerts
              ? (data?.realtimeAlerts?.filter(a => a.severity === 'critical').length ?? 0)
              : 0
          }
          showSearch={false}
          actions={
            <div className="flex gap-2">
              <Badge variant={wsConnected ? 'success' : 'warning'} size="sm" className="hidden md:inline-flex">
                {wsConnected ? '实时连接' : '离线轮询'}
              </Badge>
              {lastUpdateLabel && (
                <Badge variant="outline" size="sm" className="hidden md:inline-flex">
                  更新: {lastUpdateLabel}
                </Badge>
              )}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-9 w-28 px-3 py-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canExportReport && (
                <ReportExportButton
                  timeRange={timeRange}
                  sections={realtimeAlertsPermissionLimited ? ['stats', 'charts'] : ['stats', 'charts', 'alerts']}
                />
              )}
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                {isRefetching ? '刷新中...' : '刷新'}
              </Button>
            </div>
          }
        />

        <main className="p-5">
          <div className="space-y-6">

            {hasEffectivePartialFailure && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                      监控数据不完整
                    </p>
                    <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                      部分数据分区加载失败，页面已自动降级显示。
                    </p>
                    {realtimeAlertsPermissionLimited && (
                      <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                        另外：实时告警因权限限制未展示。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!hasEffectivePartialFailure && realtimeAlertsPermissionLimited && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex items-start gap-3">
                  <ShieldOff className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      部分数据因权限限制未展示
                    </p>
                    <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
                      当前账号缺少查看告警权限（{Permission.ALERTS_READ}），已隐藏实时告警区域。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── 关键指标 ── */}
            <section>
              <SectionHeader icon={Activity} title="关键指标" description="实时系统运行概览" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {envelope?.sections.stats?.ok === false ? (
                  <div className="col-span-full rounded-xl border-2 border-dashed border-red-200 bg-red-50/60 p-8 text-center dark:border-red-800 dark:bg-red-900/10">
                    <SectionFailureContent
                      title="关键指标"
                      message={envelope?.sections.stats?.message ?? '统计指标加载失败'}
                      onRetry={() => refetch()}
                    />
                  </div>
                ) : data.statsV2 && data.statsV2.length > 0 ? (
                  data.statsV2.map((stat, index) => {
                    const IconComponent = monitoringIconMap[stat.id as keyof typeof monitoringIconMap] || Server
                    const iconColor = monitoringIconColorMap[stat.id as keyof typeof monitoringIconColorMap] || 'text-blue-600'
                    return (
                      <StatCard
                        key={stat.id}
                        index={index}
                        title={stat.title}
                        value={stat.value}
                        change={stat.change}
                        trend={stat.trend}
                        icon={IconComponent}
                        iconColor={iconColor}
                      />
                    )
                  })
                ) : (
                  <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-muted/40 p-8 text-center dark:border-border dark:bg-muted/40">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-yellow-500" />
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      统计数据不可用
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      无法加载关键指标数据。可能的原因：后端API未响应、数据库无设备记录、网络连接异常
                    </p>
                    <Button variant="outline" onClick={() => refetch()} className="cursor-pointer">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      重新加载
                    </Button>
                  </div>
                )}
              </div>
            </section>

            {/* ── 性能趋势 ── */}
            <section ref={chartsRef}>
              <SectionHeader icon={TrendingUp} title="性能趋势" description={`${timeRangeLabel}系统性能与温度变化`} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">系统性能趋势</CardTitle>
                  </CardHeader>
                  <CardContent>
                      {chartsInView ? (
                        envelope?.sections.systemPerformance?.ok === false ? (
                          <SectionFailureContent
                            title="系统性能趋势"
                            message={envelope?.sections.systemPerformance?.message ?? '系统性能数据加载失败'}
                            onRetry={() => refetch()}
                            className="h-64"
                          />
                        ) : data.systemPerformance && data.systemPerformance.length > 0 ? (
                          <SystemPerformanceChartWrapper data={data.systemPerformance} height={280} timeRange={timeRange} />
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <p className="text-sm text-muted-foreground">暂无性能数据</p>
                        </div>
                      )
                    ) : (
                      <ChartSkeleton height={280} />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">设备温度监控</CardTitle>
                  </CardHeader>
                  <CardContent>
                      {chartsInView ? (
                        envelope?.sections.temperature?.ok === false ? (
                          <SectionFailureContent
                            title="设备温度监控"
                            message={envelope?.sections.temperature?.message ?? '温度数据加载失败'}
                            onRetry={() => refetch()}
                            className="h-64"
                          />
                        ) : data.temperatureHistory && data.temperatureHistory.length > 0 ? (
                          <TemperatureChartWrapper
                          data={data.temperatureHistory}
                          height={280}
                          temperatureThreshold={75}
                          timeRange={timeRange}
                        />
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <p className="text-sm text-muted-foreground">暂无温度数据</p>
                        </div>
                      )
                    ) : (
                      <ChartSkeleton height={280} />
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ── 状态详情 ── */}
            <section>
              <SectionHeader icon={BarChart3} title="状态详情" description="设备分布、可用性与实时告警" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                {envelope?.sections.deviceStatus?.ok === false ? (
                  <SectionFailureCard
                    title="设备状态分布"
                    message={envelope?.sections.deviceStatus?.message ?? '设备状态分布加载失败'}
                    onRetry={() => refetch()}
                  />
                ) : data.deviceStatusDistribution ? (
                  <DeviceStatusCard data={data.deviceStatusDistribution} />
                ) : null}

                {envelope?.sections.availability?.ok === false ? (
                  <SectionFailureCard
                    title="整体可用性"
                    message={envelope?.sections.availability?.message ?? '可用性数据加载失败'}
                    onRetry={() => refetch()}
                  />
                ) : data.availability ? (
                  <AvailabilityCard data={data.availability} />
                ) : null}

                {realtimeAlertsPermissionLimited ? (
                  <SectionPermissionLimitedCard
                    title="实时告警"
                    message={
                      envelope?.sections.realtimeAlerts?.message ??
                      `当前账号缺少查看告警权限（${envelope?.sections.realtimeAlerts?.requiredPermission ?? Permission.ALERTS_READ}），该区域已隐藏。`
                    }
                  />
                ) : envelope?.sections.realtimeAlerts?.ok === false ? (
                  <SectionFailureCard
                    title="实时告警"
                    message={envelope?.sections.realtimeAlerts?.message ?? '实时告警加载失败'}
                    onRetry={() => refetch()}
                  />
                ) : data.realtimeAlerts ? (
                  <RealTimeAlertsCard alerts={data.realtimeAlerts} maxItems={5} />
                ) : null}
              </div>
            </section>

            {/* ── 网络流量 ── */}
            <section ref={networkRef}>
              <SectionHeader icon={Radio} title="网络流量" description={`入站、出站及总流量的${timeRangeLabel}趋势`} />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">流量监控</CardTitle>
                </CardHeader>
                <CardContent>
                  {networkInView ? (
                    envelope?.sections.networkTraffic?.ok === false ? (
                      <SectionFailureContent
                        title="网络流量"
                        message={envelope?.sections.networkTraffic?.message ?? '网络流量数据加载失败'}
                        onRetry={() => refetch()}
                        className="h-48"
                      />
                    ) : data.networkTrafficHistory && data.networkTrafficHistory.length > 0 ? (
                      <NetworkTrafficChartWrapper data={data.networkTrafficHistory} height={240} timeRange={timeRange} />
                    ) : (
                      <div className="flex h-48 items-center justify-center">
                        <p className="text-sm text-muted-foreground">暂无流量数据</p>
                      </div>
                    )
                  ) : (
                    <ChartSkeleton height={240} />
                  )}
                </CardContent>
              </Card>
            </section>

          </div>
        </main>
      </div>
    </div>
  )
}
