'use client'

import { type Ref } from 'react'
import { MonitorOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import type { UseMonitoringPageFullResult } from '../hooks/useMonitoringPage'
import { StatsSection, PerformanceSection } from './sections'
import {
  SyncedCrosshairProvider,
  HealthDistributionBar,
  ActiveProblemsCard,
} from './overview'

interface KioskMonitoringViewProps {
  page: UseMonitoringPageFullResult
  chartsRef: Ref<HTMLDivElement>
  chartsInView: boolean
}

export function KioskMonitoringView({
  page,
  chartsRef,
  chartsInView,
}: KioskMonitoringViewProps) {
  const data = page.data

  return (
    <div
      data-testid="monitoring-kiosk-view"
      className="fixed inset-0 z-40 overflow-auto bg-background p-4 lg:p-6"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-foreground">
              监控中心 · 值班投屏模式
            </h1>
            <span className="rounded-md bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              {page.kioskCountdownSec}s 后自动刷新
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              <StatsSection
                section={page.envelope?.sections.stats}
                statsV2={data.statsV2}
                onRetry={page.refetch}
              />

              <HealthDistributionBar
                distribution={data.healthDistribution}
                onSelectBucket={(status) => {
                  page.setIsKioskMode(false)
                  page.navigateToHostsWithStatus(status)
                }}
              />

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
              />

              <ActiveProblemsCard
                problems={data.activeProblems}
                canReadAlerts={page.canReadAlerts}
                canUpdateAlerts={page.canUpdateAlerts}
                onSelectHost={(id) => page.setSelectedHostId(id)}
                onActionSuccess={() => void page.refetch()}
              />
            </div>
          </SyncedCrosshairProvider>
        )}
      </div>
    </div>
  )
}
