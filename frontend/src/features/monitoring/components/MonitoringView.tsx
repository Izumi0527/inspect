'use client'

import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard'
import { DatabaseZap, AlertTriangle } from 'lucide-react'
import { useInView } from '@/hooks'
import { useMonitoringPage } from '../hooks/useMonitoringPage'
import { StatsSection, PerformanceSection, NetworkSection } from './sections'
import {
  MonitoringLoadingSkeleton,
  MonitoringErrorPanel,
  MonitoringHeaderActions,
} from './shared'

// 模块级稳定引用，避免每次渲染重建 inView 配置对象
const IN_VIEW_OPT = { threshold: 0.1, triggerOnce: true, rootMargin: '100px' }

export function MonitoringView() {
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const page = useMonitoringPage()
  const { ref: chartsRef, inView: chartsInView } = useInView(IN_VIEW_OPT)
  const { ref: networkRef, inView: networkInView } = useInView(IN_VIEW_OPT)

  const layoutClass = `${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`
  const sidebar = <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} currentPath="/monitoring" />
  const baseHeader = <DashboardHeader title="监控中心" showSearch={false} />

  // ── 加载态 ──────────────────────────────────────────────────────────────────
  if (page.isLoading) {
    return (
      <div className="h-screen bg-muted/40 dark:bg-background overflow-hidden">
        {sidebar}
        <div className={`${layoutClass} h-full flex flex-col`}>{baseHeader}<div className="flex-1 overflow-auto"><MonitoringLoadingSkeleton /></div></div>
      </div>
    )
  }

  // ── 错误态 ──────────────────────────────────────────────────────────────────
  if (page.error) {
    return (
      <div className="h-screen bg-muted/40 dark:bg-background overflow-hidden">
        {sidebar}
        <div className={`${layoutClass} h-full flex flex-col`}>{baseHeader}<div className="flex-1 overflow-auto"><MonitoringErrorPanel error={page.error} onRetry={page.refetch} /></div></div>
      </div>
    )
  }

  // ── 无数据态 ────────────────────────────────────────────────────────────────
  if (!page.data) {
    return (
      <div className="h-screen bg-muted/40 dark:bg-background overflow-hidden">
        {sidebar}
        <div className={`${layoutClass} h-full flex flex-col`}>
          {baseHeader}
          <main className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <DatabaseZap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/80" />
              <p className="text-muted-foreground">无法加载监控数据</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ── 正常渲染 ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-muted/40 dark:bg-background overflow-hidden">
      {sidebar}
      <div className={`${layoutClass} h-full flex flex-col`}>
        <DashboardHeader
          title="监控中心"
          showSearch={false}
          actions={<MonitoringHeaderActions page={page} />}
        />
        <main className="flex-1 overflow-auto p-5">
          <div className="space-y-6">

            {/* 部分失败横幅 */}
            {page.hasEffectivePartialFailure && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">监控数据不完整</p>
                    <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">部分数据分区加载失败，页面已自动降级显示。</p>
                    {page.effectiveFailedSectionLabels.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">失败分区：{page.effectiveFailedSectionLabels.join('、')}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <StatsSection section={page.envelope?.sections.stats} statsV2={page.data.statsV2} onRetry={page.refetch} />
            <PerformanceSection
              sectionRef={chartsRef} chartsInView={chartsInView}
              sectionSystemPerformance={page.envelope?.sections.systemPerformance}
              sectionTemperature={page.envelope?.sections.temperature}
              systemPerformance={page.data.systemPerformance}
              temperatureHistory={page.data.temperatureHistory}
              timeRange={page.timeRange} onRetry={page.refetch}
            />
            <NetworkSection
              sectionRef={networkRef} networkInView={networkInView}
              deviceIds={page.deviceIds} timeRange={page.timeRange} pageVisible={page.pageVisible}
              sectionNetworkTraffic={page.envelope?.sections.networkTraffic}
              networkTrafficHistory={page.data.networkTrafficHistory}
              onRetry={page.refetch}
            />

          </div>
        </main>
      </div>
    </div>
  )
}
