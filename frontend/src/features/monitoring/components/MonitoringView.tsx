'use client'

import { useMemo } from 'react'
import { useMonitoringV2 } from '../hooks/useMonitoringV2'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { StatCard } from '@/components/shared'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '@/components/atoms'
import {
  Server,
  Activity,
  AlertTriangle,
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
        <h2 className="text-sm font-semibold text-gray-900 dark:text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-gray-500 dark:text-muted-foreground">{description}</p>
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
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{message}</p>
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

export function MonitoringView() {
  const { sidebarOpen, toggleSidebar } = useSidebar()

  const {
    data: envelope,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useMonitoringV2({
    timeRange: '24h',
    enablePolling: true,
  })

  const data = envelope?.data

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
      <div className="min-h-screen bg-gray-50 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="p-5">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse border-l-[3px] border-l-gray-300 dark:border-l-gray-600">
                    <CardContent className="p-5">
                      <div className="h-3 w-14 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="mt-3 h-7 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="mt-2 h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="mt-2 h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
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
      <div className="min-h-screen bg-gray-50 dark:bg-background">
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
      <div className="min-h-screen bg-gray-50 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="flex h-[calc(100vh-80px)] items-center justify-center">
            <div className="text-center">
              <DatabaseZap className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">无法加载监控数据</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath="/monitoring"
      />

      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        <DashboardHeader
          title="监控中心"
          alertCount={data?.realtimeAlerts?.filter(a => a.severity === 'critical').length ?? 0}
          showSearch={false}
          actions={
            <div className="flex gap-2">
              <ReportExportButton />
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

            {envelope?.hasPartialFailure && (
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
                      message="统计指标加载失败"
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
                  <div className="col-span-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/50">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-yellow-500" />
                    <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                      统计数据不可用
                    </h3>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
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
              <SectionHeader icon={TrendingUp} title="性能趋势" description="24小时系统性能与温度变化" />
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
                          message="系统性能数据加载失败"
                          onRetry={() => refetch()}
                          className="h-64"
                        />
                      ) : data.systemPerformance && data.systemPerformance.length > 0 ? (
                        <SystemPerformanceChartWrapper data={data.systemPerformance} height={280} />
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">暂无性能数据</p>
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
                          message="温度数据加载失败"
                          onRetry={() => refetch()}
                          className="h-64"
                        />
                      ) : data.temperatureHistory && data.temperatureHistory.length > 0 ? (
                        <TemperatureChartWrapper
                          data={data.temperatureHistory}
                          height={280}
                          temperatureThreshold={75}
                        />
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">暂无温度数据</p>
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
                    message="设备状态分布加载失败"
                    onRetry={() => refetch()}
                  />
                ) : data.deviceStatusDistribution ? (
                  <DeviceStatusCard data={data.deviceStatusDistribution} />
                ) : null}

                {envelope?.sections.availability?.ok === false ? (
                  <SectionFailureCard
                    title="整体可用性"
                    message="可用性数据加载失败"
                    onRetry={() => refetch()}
                  />
                ) : data.availability ? (
                  <AvailabilityCard data={data.availability} />
                ) : null}

                {envelope?.sections.realtimeAlerts?.ok === false ? (
                  <SectionFailureCard
                    title="实时告警"
                    message="实时告警加载失败"
                    onRetry={() => refetch()}
                  />
                ) : data.realtimeAlerts ? (
                  <RealTimeAlertsCard alerts={data.realtimeAlerts} maxItems={5} />
                ) : null}
              </div>
            </section>

            {/* ── 网络流量 ── */}
            <section ref={networkRef}>
              <SectionHeader icon={Radio} title="网络流量" description="入站、出站及总流量的24小时趋势" />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">流量监控</CardTitle>
                </CardHeader>
                <CardContent>
                  {networkInView ? (
                    envelope?.sections.networkTraffic?.ok === false ? (
                      <SectionFailureContent
                        title="网络流量"
                        message="网络流量数据加载失败"
                        onRetry={() => refetch()}
                        className="h-48"
                      />
                    ) : data.networkTrafficHistory && data.networkTrafficHistory.length > 0 ? (
                      <NetworkTrafficChartWrapper data={data.networkTrafficHistory} height={240} />
                    ) : (
                      <div className="flex h-48 items-center justify-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">暂无流量数据</p>
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
