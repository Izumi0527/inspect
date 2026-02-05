'use client'

import { useMemo } from 'react'
import { useMonitoringV2 } from '../hooks/useMonitoringV2'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { StatCard } from '@/components/shared'
import {
  Server,
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  Network
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

// 图标映射(根据监控中心的6个统计卡片)
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
 * 监控中心 v1.1 主视图组件
 *
 * 采用现代商务风格设计,包含:
 * - 6个统计卡片
 * - 2个图表(系统性能趋势 + 设备温度监控)
 * - 3个详情卡片(设备状态分布 + 整体可用性 + 实时告警)
 * - 1个独立网络流量区域
 *
 * @features
 * - 支持 Mock/Real API 数据切换(通过环境变量 NEXT_PUBLIC_USE_MOCK_DATA)
 * - 自动轮询刷新(60秒间隔)
 * - 图表懒加载(IntersectionObserver)
 * - 代码分割(React.lazy)
 * - 错误处理与重试
 */
export function MonitoringViewV2() {
  // ==================== Sidebar 状态 ====================
  const { sidebarOpen, toggleSidebar } = useSidebar()

  // ==================== 数据获取 ====================
  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useMonitoringV2({
    timeRange: '24h',
    // 使用 hook 默认的 2 分钟轮询间隔
    enablePolling: true,
  })

  // ==================== 懒加载配置 ====================
  const chartInViewOptions = useMemo(
    () => ({
      threshold: 0.1,
      triggerOnce: true,
      rootMargin: '100px', // 提前 100px 加载
    }),
    []
  )

  const networkInViewOptions = useMemo(
    () => ({
      threshold: 0.1,
      triggerOnce: true,
      rootMargin: '100px',
    }),
    []
  )

  // 懒加载 hooks
  const { ref: chartsRef, inView: chartsInView } = useInView(chartInViewOptions)
  const { ref: networkRef, inView: networkInView } = useInView(networkInViewOptions)

  // ==================== 加载状态 ====================
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <p className="text-gray-600 dark:text-gray-400">加载监控数据中...</p>
        </div>
      </div>
    )
  }

  // ==================== 错误状态 ====================
  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <div className="mb-4 text-5xl">⚠️</div>
          <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-100">
            数据加载失败
          </h3>
          <p className="mb-4 text-sm text-red-700 dark:text-red-300">
            {error.message || '无法连接到监控服务器'}
          </p>
          <button
            onClick={() => refetch()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            🔄 重新加载
          </button>
        </div>
      </div>
    )
  }

  // ==================== 无数据状态 ====================
  if (!data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400">
          <p>无法加载监控数据</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Sidebar 导航 */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath="/monitoring"
      />

      {/* 主内容区 - 动态左边距 */}
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Header - 与总览页面相同的层级 */}
        <DashboardHeader
          title="监控中心"
          alertCount={data?.realtimeAlerts?.filter(a => a.severity === 'critical').length ?? 0}
          showSearch={false}
          actions={
            <>
              <ReportExportButton />
              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  isRefetching
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {isRefetching ? '⏳ 刷新中...' : '🔄 刷新'}
              </button>
            </>
          }
        />

        {/* 主内容区域 */}
        <main className="p-4">
          <div className="space-y-4">
            {/* 统计卡片网格(6个) */}
            <section>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {data.statsV2 && data.statsV2.length > 0 ? (
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
                  <div className="col-span-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/50">
                    <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-500" />
                    <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      统计数据不可用
                    </h3>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      无法加载关键指标数据。可能的原因：后端API未响应、数据库无设备记录、网络连接异常
                    </p>
                    <button
                      onClick={() => refetch()}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                    >
                      🔄 重新加载
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* 图表区域(2列) */}
            <section ref={chartsRef}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* 系统性能趋势图 */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                    系统性能趋势
                  </h3>
                  <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                    CPU、内存、网络流量的24小时趋势
                  </p>
                  {chartsInView ? (
                    data.systemPerformance && data.systemPerformance.length > 0 ? (
                      <SystemPerformanceChartWrapper data={data.systemPerformance} height={280} />
                    ) : (
                      <div className="flex h-64 items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">暂无性能数据</p>
                      </div>
                    )
                  ) : (
                    <ChartSkeleton height={280} />
                  )}
                </div>

                {/* 设备温度监控图 */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                    设备温度监控
                  </h3>
                  <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                    多设备温度趋势对比(阈值: 75°C)
                  </p>
                  {chartsInView ? (
                    data.temperatureHistory && data.temperatureHistory.length > 0 ? (
                      <TemperatureChartWrapper
                        data={data.temperatureHistory}
                        height={280}
                        temperatureThreshold={75}
                      />
                    ) : (
                      <div className="flex h-64 items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">暂无温度数据</p>
                      </div>
                    )
                  ) : (
                    <ChartSkeleton height={280} />
                  )}
                </div>
              </div>
            </section>

            {/* 详情区域(3列) */}
            <section>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                {/* 设备状态分布卡片 */}
                {data.deviceStatusDistribution && (
                  <DeviceStatusCard data={data.deviceStatusDistribution} />
                )}

                {/* 整体可用性卡片 */}
                {data.availability && <AvailabilityCard data={data.availability} />}

                {/* 实时告警卡片 */}
                {data.realtimeAlerts && (
                  <RealTimeAlertsCard alerts={data.realtimeAlerts} maxItems={5} />
                )}
              </div>
            </section>

            {/* 网络流量区域(独立) */}
            <section ref={networkRef}>
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {networkInView ? (
                  data.networkTrafficHistory && data.networkTrafficHistory.length > 0 ? (
                    <NetworkTrafficChartWrapper data={data.networkTrafficHistory} height={240} />
                  ) : (
                    <div className="flex h-48 items-center justify-center">
                      <p className="text-gray-500 dark:text-gray-400">暂无流量数据</p>
                    </div>
                  )
                ) : (
                  <ChartSkeleton height={240} />
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
