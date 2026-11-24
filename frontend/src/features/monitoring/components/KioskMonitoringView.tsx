'use client'

import { useEffect, useState, type Ref } from 'react'
import { MonitorOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import type { UseMonitoringPageFullResult } from '../hooks/useMonitoringPage'
import { resolveActiveAlertCount } from '../utils/monitoring'
import { EngineHealthPopover } from './EngineHealthPopover'
import { PerformanceSection, NetworkSection } from './sections'
import {
  SyncedCrosshairProvider,
  HealthDistributionBar,
  GroupHealthStrip,
  TopNRankingCard,
  ActiveProblemsCard,
} from './overview'

interface KioskMonitoringViewProps {
  page: UseMonitoringPageFullResult
  chartsRef: Ref<HTMLDivElement>
  chartsInView: boolean
  networkRef: Ref<HTMLDivElement>
  networkInView: boolean
}

function formatLocalClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function KioskMonitoringView({
  page,
  chartsRef,
  chartsInView,
  networkRef,
  networkInView,
}: KioskMonitoringViewProps) {
  const data = page.data
  const activeAlertCount = resolveActiveAlertCount(data)
  const [clockLabel, setClockLabel] = useState('')

  useEffect(() => {
    const updateClock = () => setClockLabel(formatLocalClock(new Date()))
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  const healthDistributionCard = data ? (
    <HealthDistributionBar
      distribution={data.healthDistribution}
      activeAlertCount={activeAlertCount}
      canReadAlerts={page.canReadAlerts}
      onSelectBucket={(status) => {
        page.setIsKioskMode(false)
        page.navigateToHostsWithStatus(status)
      }}
    />
  ) : null

  const hasGroupSummaries = Boolean(data?.groupSummaries && data.groupSummaries.length > 0)

  return (
    <div
      data-testid="monitoring-kiosk-view"
      className="fixed inset-0 z-40 overflow-auto bg-background p-4 xl:p-5 2xl:p-6"
    >
      <div className="mx-auto flex min-h-full w-full flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <h1 className="text-lg font-semibold text-foreground">
              监控中心 · 值班投屏模式
            </h1>
            <span className="rounded-md border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-foreground">
              {page.timeRangeLabel}
            </span>
            <span
              data-testid="kiosk-live-clock"
              className="rounded-md bg-surface-2 px-2.5 py-0.5 font-mono text-xs text-foreground tabular-nums"
            >
              {clockLabel || '--:--:--'}
            </span>
            <span className="rounded-md bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              {page.kioskCountdownSec}s 后自动刷新
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <EngineHealthPopover
              onSelectHost={(id) => page.setSelectedHostId(id)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => page.refetch()}
              disabled={page.isRefetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${page.isRefetching ? 'animate-spin' : ''}`}
              />
              立即刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => page.setIsKioskMode(false)}
            >
              <MonitorOff className="mr-1.5 h-3.5 w-3.5" />
              退出投屏 (Esc)
            </Button>
          </div>
        </header>

        {data && (
          <SyncedCrosshairProvider>
            <div className="flex flex-col gap-4">
              {hasGroupSummaries ? (
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
                  <div className="min-w-0 2xl:col-span-7">
                    {healthDistributionCard}
                  </div>
                  <div className="min-w-0 rounded-xl border border-border bg-card p-4 2xl:col-span-5">
                    <GroupHealthStrip
                      groups={data.groupSummaries}
                      activeGroupId={page.activeGroupId}
                      onSelectGroup={(gid) => page.setActiveGroupId(gid)}
                    />
                  </div>
                </div>
              ) : (
                healthDistributionCard
              )}

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
                <div className="min-w-0 2xl:col-span-8">
                  <PerformanceSection
                    sectionRef={chartsRef}
                    chartsInView={chartsInView}
                    sectionSystemPerformance={page.envelope?.sections.systemPerformance}
                    sectionTemperature={page.envelope?.sections.temperature}
                    systemPerformance={data.systemPerformance}
                    temperatureHistory={data.temperatureHistory}
                    timeRange={page.timeRange}
                    onRetry={page.refetch}
                    thresholds={data.thresholds}
                    aggregateTrends={data.aggregateTrends}
                    yesterdayBaseline={data.yesterdayBaseline}
                    annotations={data.annotations}
                    canReadAlerts={page.canReadAlerts}
                    compareYesterday={page.compareYesterday}
                    onToggleCompareYesterday={page.setCompareYesterday}
                    onSelectHost={(id) => page.setSelectedHostId(id)}
                    filterResetKey={`${page.activeGroupId ?? 'all'}:${page.deviceIds.join(',')}`}
                  />
                </div>
                <div className="min-w-0 2xl:col-span-4">
                  <NetworkSection
                    sectionRef={networkRef}
                    networkInView={networkInView}
                    deviceIds={page.deviceIds}
                    timeRange={page.timeRange}
                    pageVisible={page.pageVisible}
                    sectionNetworkTraffic={page.envelope?.sections.networkTraffic}
                    networkTrafficHistory={data.networkTrafficHistory}
                    onRetry={page.refetch}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="min-w-0 xl:col-span-5">
                  <TopNRankingCard
                    groupId={page.activeGroupId}
                    deviceIds={page.deviceIds}
                    thresholds={data.thresholds}
                    onSelectHost={(id) => page.setSelectedHostId(id)}
                  />
                </div>
                <div className="min-w-0 xl:col-span-7">
                  <ActiveProblemsCard
                    problems={data.activeProblems}
                    canReadAlerts={page.canReadAlerts}
                    canUpdateAlerts={page.canUpdateAlerts}
                    onSelectHost={(id) => page.setSelectedHostId(id)}
                    onActionSuccess={() => void page.refetch()}
                  />
                </div>
              </div>
            </div>
          </SyncedCrosshairProvider>
        )}
      </div>
    </div>
  )
}
