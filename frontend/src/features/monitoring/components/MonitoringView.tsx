'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import { AlertTriangle, DatabaseZap } from 'lucide-react'
import { AppLayout } from '@/components/layout'
import { useInView } from '@/hooks'
import { useMonitoringPage } from '../hooks/useMonitoringPage'
import type { MonitoringTabKey } from '../types/zabbix-monitoring.types'
import { KioskMonitoringView } from './KioskMonitoringView'
import { StatsSection, PerformanceSection, NetworkSection } from './sections'
import {
  SyncedCrosshairProvider,
  HealthDistributionBar,
  GroupHealthStrip,
  TopNRankingCard,
  ActiveProblemsCard,
} from './overview'
import { HostDetailDrawer } from './hosts/HostDetailDrawer'
import { HostsMatrixTab } from './hosts/HostsMatrixTab'
import { LatestDataTab } from './latest/LatestDataTab'
import { MaintenanceTab } from './maintenance/MaintenanceTab'
import { TemplatesTab } from './templates/TemplatesTab'
import { TriggersTab } from './triggers/TriggersTab'
import {
  MonitoringLoadingSkeleton,
  MonitoringErrorPanel,
  MonitoringHeaderActions,
} from './shared'

const IN_VIEW_OPT = { threshold: 0.1, triggerOnce: true, rootMargin: '100px' }

const MONITORING_TABS: ReadonlyArray<{ key: MonitoringTabKey; label: string }> = [
  { key: 'overview', label: '总览大屏' },
  { key: 'hosts', label: '设备监控' },
  { key: 'latest', label: '实时指标明细' },
  { key: 'templates', label: '监控方案' },
  { key: 'triggers', label: '告警规则' },
  { key: 'maintenance', label: '计划维护' },
]

export function MonitoringView() {
  const page = useMonitoringPage()
  const { ref: chartsRef, inView: chartsInView } = useInView(IN_VIEW_OPT)
  const { ref: networkRef, inView: networkInView } = useInView(IN_VIEW_OPT)

  if (page.isLoading) {
    return (
      <AppLayout title="监控中心">
        <MonitoringLoadingSkeleton />
      </AppLayout>
    )
  }

  if (page.error) {
    return (
      <AppLayout title="监控中心">
        <MonitoringErrorPanel error={page.error} onRetry={page.refetch} />
      </AppLayout>
    )
  }

  if (!page.data) {
    return (
      <AppLayout title="监控中心">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <DatabaseZap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/80" />
            <p className="text-muted-foreground">无法加载监控数据</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (page.isKioskMode) {
    return (
      <>
        <KioskMonitoringView
          page={page}
          chartsRef={chartsRef}
          chartsInView={chartsInView}
        />
        <HostDetailDrawer
          deviceId={page.selectedHostId}
          onClose={() => page.setSelectedHostId(null)}
          onSelectHost={(id) => page.setSelectedHostId(id)}
        />
      </>
    )
  }

  return (
    <AppLayout title="监控中心" actions={<MonitoringHeaderActions page={page} />}>
      <TabsPrimitive.Root
        value={page.activeTab}
        onValueChange={(value) => page.setActiveTab(value as MonitoringTabKey)}
        className="flex flex-col gap-4"
      >
        <TabsPrimitive.List
          aria-label="监控中心工作台切换"
          className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2/80 p-1"
        >
          {MONITORING_TABS.map((tab) => (
            <TabsPrimitive.Trigger
              key={tab.key}
              value={tab.key}
              className="inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {tab.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="overview" className="focus-visible:outline-none">
          <SyncedCrosshairProvider>
            <div className="flex flex-col gap-4">
              {page.hasEffectivePartialFailure && (
                <div className="rounded-xl border border-warning/40 bg-warning-soft/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                    <div>
                      <p className="text-sm font-semibold text-warning-soft-foreground">
                        监控数据不完整
                      </p>
                      <p className="mt-1 text-xs text-warning-soft-foreground/90">
                        部分数据分区加载失败，页面已自动降级显示。
                      </p>
                      {page.effectiveFailedSectionLabels.length > 0 && (
                        <p className="mt-1 text-xs text-warning-soft-foreground/90">
                          失败分区：{page.effectiveFailedSectionLabels.join('、')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <StatsSection
                section={page.envelope?.sections.stats}
                statsV2={page.data.statsV2}
                onRetry={page.refetch}
              />

              <HealthDistributionBar
                distribution={page.data.healthDistribution}
                onSelectBucket={(status) => page.navigateToHostsWithStatus(status)}
              />

              <GroupHealthStrip
                groups={page.data.groupSummaries}
                activeGroupId={page.activeGroupId}
                onSelectGroup={(gid) => page.setActiveGroupId(gid)}
              />

              <PerformanceSection
                sectionRef={chartsRef}
                chartsInView={chartsInView}
                sectionSystemPerformance={page.envelope?.sections.systemPerformance}
                sectionTemperature={page.envelope?.sections.temperature}
                systemPerformance={page.data.systemPerformance}
                temperatureHistory={page.data.temperatureHistory}
                timeRange={page.timeRange}
                onRetry={page.refetch}
                thresholds={page.data.thresholds}
                aggregateTrends={page.data.aggregateTrends}
                yesterdayBaseline={page.data.yesterdayBaseline}
                annotations={page.data.annotations}
                canReadAlerts={page.canReadAlerts}
                compareYesterday={page.compareYesterday}
                onToggleCompareYesterday={page.setCompareYesterday}
                onSelectHost={(id) => page.setSelectedHostId(id)}
              />

              <NetworkSection
                sectionRef={networkRef}
                networkInView={networkInView}
                deviceIds={page.deviceIds}
                timeRange={page.timeRange}
                pageVisible={page.pageVisible}
                sectionNetworkTraffic={page.envelope?.sections.networkTraffic}
                networkTrafficHistory={page.data.networkTrafficHistory}
                onRetry={page.refetch}
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TopNRankingCard
                  groupId={page.activeGroupId}
                  onSelectHost={(id) => page.setSelectedHostId(id)}
                />
                <ActiveProblemsCard
                  problems={page.data.activeProblems}
                  canReadAlerts={page.canReadAlerts}
                  canUpdateAlerts={page.canUpdateAlerts}
                  onSelectHost={(id) => page.setSelectedHostId(id)}
                  onActionSuccess={() => void page.refetch()}
                />
              </div>
            </div>
          </SyncedCrosshairProvider>
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="hosts" className="focus-visible:outline-none">
          <HostsMatrixTab
            activeGroupId={page.activeGroupId}
            initialStatusFilter={page.initialHostStatusFilter}
            onSelectGroup={(gid) => page.setActiveGroupId(gid)}
            onSelectHost={(id) => page.setSelectedHostId(id)}
          />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="latest" className="focus-visible:outline-none">
          <LatestDataTab
            activeGroupId={page.activeGroupId}
            selectedDeviceIds={page.deviceIds}
            onSelectHost={(id) => page.setSelectedHostId(id)}
          />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="templates" className="focus-visible:outline-none">
          <TemplatesTab />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="triggers" className="focus-visible:outline-none">
          <TriggersTab notificationChannelSummary={page.data.notificationChannelSummary} />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="maintenance" className="focus-visible:outline-none">
          <MaintenanceTab />
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>

      <HostDetailDrawer
        deviceId={page.selectedHostId}
        onClose={() => page.setSelectedHostId(null)}
        onSelectHost={(id) => page.setSelectedHostId(id)}
      />
    </AppLayout>
  )
}
