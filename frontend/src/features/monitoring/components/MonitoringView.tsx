'use client'

import Link from 'next/link'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Permission } from '@/lib/types/auth.types'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { CompactStatCard } from '@/components/shared'
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
import { resolveMonitoringErrorView } from '../utils/monitoring-error'
import { TIME_RANGE_OPTIONS } from '../utils/monitoring'
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
import { SectionHeader, SectionFailureContent, SectionFailureCard, SectionPermissionLimitedCard } from './shared'
import { useMonitoringPage } from '../hooks/useMonitoringPage'
import { useMemo } from 'react'

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
  total_devices: 'text-blue-600 dark:text-blue-400',
  availability: 'text-green-600 dark:text-green-400',
  active_alerts: 'text-red-600 dark:text-red-400',
  avg_cpu: 'text-teal-600 dark:text-teal-400',
  avg_memory: 'text-orange-600 dark:text-orange-400',
  avg_network: 'text-cyan-600 dark:text-cyan-400',
}

export function MonitoringView() {
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const page = useMonitoringPage()

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
  if (page.isLoading) {
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
  const errorView = page.error ? resolveMonitoringErrorView(page.error) : null

  if (page.error) {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
        <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
          <DashboardHeader title="监控中心" showSearch={false} />
          <main className="flex h-[calc(100vh-80px)] items-center justify-center p-5">
            <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/40">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <WifiOff className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-100">
                {errorView?.title ?? '数据加载失败'}
              </h3>
              <p className="mb-5 text-sm text-red-700 dark:text-red-300">
                {errorView?.message ?? '暂时无法加载监控数据，请稍后重试。'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {errorView?.primaryAction?.href && (
                  <Button asChild className="cursor-pointer">
                    <Link href={errorView.primaryAction.href}>
                      {errorView.primaryAction.label}
                    </Link>
                  </Button>
                )}
                {errorView?.secondaryAction?.href && (
                  <Button asChild variant="outline" className="cursor-pointer">
                    <Link href={errorView.secondaryAction.href}>
                      {errorView.secondaryAction.label}
                    </Link>
                  </Button>
                )}
                <Button variant="outline" onClick={() => page.refetch()} className="cursor-pointer">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新加载
                </Button>
              </div>

              {errorView?.details && (
                <details className="mt-4 rounded-lg border border-red-200 bg-white/50 p-3 text-left text-xs text-red-900 dark:border-red-800 dark:bg-red-950/20 dark:text-red-100">
                  <summary className="cursor-pointer select-none">
                    查看详情（仅用于排障）
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words">
                    {errorView.details}
                  </pre>
                </details>
              )}
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ==================== 无数据状态 ====================
  if (!page.data) {
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
            page.canReadAlerts
              ? (page.data?.realtimeAlerts?.filter(a => a.severity === 'critical')?.length ?? 0)
              : 0
          }
          showSearch={false}
          actions={
            <div className="flex gap-2">
              <Badge
                variant={page.wsHealth === 'connected' ? 'success' : 'warning'}
                size="sm"
                className="hidden md:inline-flex"
              >
                {page.wsHealth === 'connected'
                  ? '实时连接'
                  : page.wsHealth === 'stale'
                    ? '连接不活跃'
                    : '离线轮询'}
              </Badge>
              {page.lastUpdateLabel && (
                <Badge
                  variant={page.isDataStale ? 'warning' : 'outline'}
                  size="sm"
                  className="hidden md:inline-flex"
                >
                  更新: {page.lastUpdateLabel}
                  {page.isDataStale && page.dataAgeLabel ? `（已${page.dataAgeLabel}未更新）` : ''}
                </Badge>
              )}
              <Select value={page.timeRange} onValueChange={page.setTimeRange}>
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

              {page.canExportReport && (
                <ReportExportButton
                  timeRange={page.timeRange}
                  sections={page.realtimeAlertsPermissionLimited ? ['stats', 'charts'] : ['stats', 'charts', 'alerts']}
                />
              )}
              <Button
                variant="outline"
                onClick={() => page.refetch()}
                disabled={page.isRefetching}
                className="cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${page.isRefetching ? 'animate-spin' : ''}`} />
                {page.isRefetching ? '刷新中...' : '刷新'}
              </Button>
            </div>
          }
        />

        <main className="p-5">
          <div className="space-y-6">

            {page.hasEffectivePartialFailure && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                      监控数据不完整
                    </p>
                    <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                      部分数据分区加载失败，页面已自动降级显示。
                    </p>
                    {page.effectiveFailedSectionLabels.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                        失败分区：{page.effectiveFailedSectionLabels.join('、')}
                      </p>
                    )}
                    {page.realtimeAlertsPermissionLimited && (
                      <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                        另外：实时告警因权限限制未展示。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!page.hasEffectivePartialFailure && page.realtimeAlertsPermissionLimited && (
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
              <SectionHeader icon={Activity} title="关键指标" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {page.envelope?.sections.stats?.ok === false ? (
                  <div className="col-span-full rounded-xl border-2 border-dashed border-red-200 bg-red-50/60 p-8 text-center dark:border-red-800 dark:bg-red-900/10">
                    <SectionFailureContent
                      title="关键指标"
                      message={page.envelope?.sections.stats?.message ?? '统计指标加载失败'}
                      onRetry={() => page.refetch()}
                    />
                  </div>
                ) : page.data.statsV2 && page.data.statsV2.length > 0 ? (
                  page.data.statsV2.map((stat) => {
                    const IconComponent = monitoringIconMap[stat.id as keyof typeof monitoringIconMap] || Server
                    const iconClassName = monitoringIconColorMap[stat.id as keyof typeof monitoringIconColorMap] || 'text-blue-600 dark:text-blue-400'
                    return (
                      <CompactStatCard
                        key={stat.id}
                        title={stat.title}
                        value={stat.value}
                        change={stat.change}
                        trend={stat.trend}
                        icon={IconComponent}
                        iconClassName={iconClassName}
                      />
                    )
                  })
                ) : (
                  <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-muted/40 p-8 text-center dark:border-border dark:bg-muted/40">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-yellow-500" />
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      暂无统计数据
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      尚未采集到关键指标数据。你可以先添加设备并启动采集，或稍后重试。
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button asChild className="cursor-pointer">
                        <Link href="/devices">去设备管理</Link>
                      </Button>
                      <Button asChild variant="outline" className="cursor-pointer">
                        <Link href="/settings">查看采集配置</Link>
                      </Button>
                      <Button variant="outline" onClick={() => page.refetch()} className="cursor-pointer">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        重新加载
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── 性能趋势 ── */}
            <section ref={chartsRef}>
              <SectionHeader icon={TrendingUp} title="性能趋势" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">系统性能趋势</CardTitle>
                  </CardHeader>
                  <CardContent>
                      {chartsInView ? (
                        page.envelope?.sections.systemPerformance?.ok === false ? (
                          <SectionFailureContent
                            title="系统性能趋势"
                            message={page.envelope?.sections.systemPerformance?.message ?? '系统性能数据加载失败'}
                            onRetry={() => page.refetch()}
                            className="h-64"
                          />
                        ) : page.data.systemPerformance && page.data.systemPerformance.length > 0 ? (
                          <SystemPerformanceChartWrapper data={page.data.systemPerformance} height={280} timeRange={page.timeRange} />
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
                        page.envelope?.sections.temperature?.ok === false ? (
                          <SectionFailureContent
                            title="设备温度监控"
                            message={page.envelope?.sections.temperature?.message ?? '温度数据加载失败'}
                            onRetry={() => page.refetch()}
                            className="h-64"
                          />
                        ) : page.data.temperatureHistory && page.data.temperatureHistory.length > 0 ? (
                          <TemperatureChartWrapper
                          data={page.data.temperatureHistory}
                          height={280}
                          temperatureThreshold={75}
                          timeRange={page.timeRange}
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
              <SectionHeader icon={BarChart3} title="状态详情" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                {page.envelope?.sections.deviceStatus?.ok === false ? (
                  <SectionFailureCard
                    title="设备状态分布"
                    message={page.envelope?.sections.deviceStatus?.message ?? '设备状态分布加载失败'}
                    onRetry={() => page.refetch()}
                  />
                ) : page.data.deviceStatusDistribution ? (
                  <DeviceStatusCard data={page.data.deviceStatusDistribution} />
                ) : null}

                {page.envelope?.sections.availability?.ok === false ? (
                  <SectionFailureCard
                    title="整体可用性"
                    message={page.envelope?.sections.availability?.message ?? '可用性数据加载失败'}
                    onRetry={() => page.refetch()}
                  />
                ) : page.data.availability ? (
                  <AvailabilityCard data={page.data.availability} />
                ) : null}

                {page.realtimeAlertsPermissionLimited ? (
                  <SectionPermissionLimitedCard
                    title="实时告警"
                    message={
                      page.envelope?.sections.realtimeAlerts?.message ??
                      `当前账号缺少查看告警权限（${page.envelope?.sections.realtimeAlerts?.requiredPermission ?? Permission.ALERTS_READ}），该区域已隐藏。`
                    }
                  />
                ) : page.envelope?.sections.realtimeAlerts?.ok === false ? (
                  <SectionFailureCard
                    title="实时告警"
                    message={page.envelope?.sections.realtimeAlerts?.message ?? '实时告警加载失败'}
                    onRetry={() => page.refetch()}
                  />
                ) : page.data.realtimeAlerts ? (
                  <RealTimeAlertsCard alerts={page.data.realtimeAlerts} maxItems={5} />
                ) : null}
              </div>
            </section>

            {/* ── 网络流量 ── */}
            <section ref={networkRef}>
              <SectionHeader icon={Radio} title="网络流量" />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">流量监控</CardTitle>
                </CardHeader>
                <CardContent>
                  {networkInView ? (
                    page.envelope?.sections.networkTraffic?.ok === false ? (
                      <SectionFailureContent
                        title="网络流量"
                        message={page.envelope?.sections.networkTraffic?.message ?? '网络流量数据加载失败'}
                        onRetry={() => page.refetch()}
                        className="h-48"
                      />
                    ) : page.data.networkTrafficHistory && page.data.networkTrafficHistory.length > 0 ? (
                      <NetworkTrafficChartWrapper data={page.data.networkTrafficHistory} height={240} timeRange={page.timeRange} />
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
