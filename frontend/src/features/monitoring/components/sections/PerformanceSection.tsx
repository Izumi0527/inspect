'use client'

import { useEffect, useMemo, useState, type Ref } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { Switch } from '@/components/ui/switch'
import { SectionFailureContent } from '../shared'
import {
  SystemPerformanceChartWrapper,
  TemperatureChartWrapper,
  ChartSkeleton,
} from '../charts'
import { PerformanceMetricLegend, type PerformanceMetricKey } from '../charts/PerformanceMetricLegend'
import { AggregateTrendChart } from '../overview/AggregateTrendChart'
import type { MonitoringDataEnvelope, MonitoringDataV2, SystemPerformanceDataPoint } from '../../types'
import type {
  AggregateTrendPoint,
  DashboardAnnotation,
  ThresholdSummary,
} from '../../types/zabbix-monitoring.types'

interface PerformanceSectionProps {
  sectionRef: Ref<HTMLDivElement>
  chartsInView: boolean
  sectionSystemPerformance: MonitoringDataEnvelope['sections']['systemPerformance'] | undefined
  sectionTemperature: MonitoringDataEnvelope['sections']['temperature'] | undefined
  systemPerformance: MonitoringDataV2['systemPerformance']
  temperatureHistory: MonitoringDataV2['temperatureHistory']
  timeRange: string
  onRetry: () => void
  thresholds?: ThresholdSummary
  aggregateTrends?: AggregateTrendPoint[]
  yesterdayBaseline?: SystemPerformanceDataPoint[]
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  compareYesterday?: boolean
  onToggleCompareYesterday?: (enabled: boolean) => void
  onSelectHost?: (deviceId: number) => void
  filterResetKey?: string
}

function buildFallbackAggregateTrends(
  points: SystemPerformanceDataPoint[]
): AggregateTrendPoint[] {
  return points.flatMap((pt) => {
    const entries = Object.entries(pt.devices).sort(([a], [b]) => a.localeCompare(b))
    if (entries.length === 0) return []
    const cpus = entries.map(([, val]) => val.cpu).sort((a, b) => a - b)
    const mems = entries.map(([, val]) => val.memory).sort((a, b) => a - b)
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const p95 = (arr: number[]) => arr[Math.max(0, Math.ceil(0.95 * arr.length) - 1)]
    let peakName = ''
    let peakCpu = -Infinity
    let peakMemoryName = ''
    let peakMemory = -Infinity
    for (const [name, val] of entries) {
      if (val.cpu > peakCpu) {
        peakCpu = val.cpu
        peakName = name
      }
      if (val.memory > peakMemory) {
        peakMemory = val.memory
        peakMemoryName = name
      }
    }
    return [{
      timestamp: typeof pt.timestamp === 'string' ? pt.timestamp : pt.timestamp.toISOString(),
      mean_cpu: Number(mean(cpus).toFixed(2)),
      p95_cpu: Number(p95(cpus).toFixed(2)),
      max_cpu: cpus[cpus.length - 1],
      mean_memory: Number(mean(mems).toFixed(2)),
      p95_memory: Number(p95(mems).toFixed(2)),
      max_memory: mems[mems.length - 1],
      peak_device_name: peakName || undefined,
      peak_memory_device_name: peakMemoryName || undefined,
    }]
  })
}

export function PerformanceSection({
  sectionRef,
  chartsInView,
  sectionSystemPerformance,
  sectionTemperature,
  systemPerformance,
  temperatureHistory,
  timeRange,
  onRetry,
  thresholds,
  aggregateTrends,
  yesterdayBaseline,
  annotations,
  canReadAlerts = true,
  compareYesterday = false,
  onToggleCompareYesterday,
  onSelectHost,
  filterResetKey,
}: PerformanceSectionProps) {
  const [hiddenMetrics, setHiddenMetrics] = useState<ReadonlySet<PerformanceMetricKey>>(new Set())
  const [modeOverride, setModeOverride] = useState<'auto' | 'aggregate' | 'compare'>('auto')

  useEffect(() => {
    setModeOverride('auto')
  }, [filterResetKey])

  const toggleMetric = (metric: PerformanceMetricKey) => {
    setHiddenMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(metric)) next.delete(metric)
      else next.add(metric)
      return next
    })
  }

  const deviceCount = useMemo(() => {
    const names = new Set<string>()
    for (const pt of systemPerformance ?? []) {
      for (const name of Object.keys(pt.devices)) names.add(name)
    }
    return names.size
  }, [systemPerformance])

  const resolvedAggregateTrends = useMemo(() => {
    if (aggregateTrends && aggregateTrends.length > 0) return aggregateTrends
    return buildFallbackAggregateTrends(systemPerformance ?? [])
  }, [aggregateTrends, systemPerformance])

  const effectiveMode: 'aggregate' | 'compare' =
    modeOverride === 'auto'
      ? deviceCount === 0 && resolvedAggregateTrends.length > 0
        ? 'aggregate'
        : deviceCount > 5
          ? 'aggregate'
          : 'compare'
      : modeOverride

  const hasPerfData =
    (systemPerformance && systemPerformance.length > 0) ||
    resolvedAggregateTrends.length > 0

  const showPerformanceChart =
    chartsInView && sectionSystemPerformance?.ok !== false && hasPerfData

  return (
    <section ref={sectionRef}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">系统性能趋势</CardTitle>
              {showPerformanceChart && (
                <PerformanceMetricLegend
                  hiddenMetrics={hiddenMetrics}
                  onToggle={toggleMetric}
                  variant={effectiveMode === 'aggregate' ? 'color' : 'line-style'}
                />
              )}
            </div>
            {showPerformanceChart && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5" role="group" aria-label="性能趋势视图模式">
                  <button
                    type="button"
                    aria-pressed={effectiveMode === 'aggregate'}
                    onClick={() => setModeOverride('aggregate')}
                    className={`rounded px-2 py-0.5 font-medium transition-colors ${
                      effectiveMode === 'aggregate'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    全网聚合态势
                  </button>
                  <button
                    type="button"
                    aria-pressed={effectiveMode === 'compare'}
                    onClick={() => setModeOverride('compare')}
                    className={`rounded px-2 py-0.5 font-medium transition-colors ${
                      effectiveMode === 'compare'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    精选设备对比
                  </button>
                </div>

                {onToggleCompareYesterday && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                    <Switch
                      checked={compareYesterday}
                      onCheckedChange={onToggleCompareYesterday}
                      aria-label="对比昨日同期"
                      className="h-5 w-9"
                    />
                    <span>对比昨日同期</span>
                  </label>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {chartsInView ? (
              sectionSystemPerformance?.ok === false ? (
                <SectionFailureContent
                  title="系统性能趋势"
                  message={sectionSystemPerformance?.message ?? '系统性能数据加载失败'}
                  onRetry={onRetry}
                  className="h-64"
                />
              ) : showPerformanceChart ? (
                effectiveMode === 'aggregate' ? (
                  <AggregateTrendChart
                    data={resolvedAggregateTrends}
                    yesterdayBaseline={yesterdayBaseline}
                    annotations={annotations}
                    hiddenMetrics={hiddenMetrics}
                    compareYesterday={compareYesterday}
                    canReadAlerts={canReadAlerts}
                    timeRange={timeRange}
                    height={280}
                    onSelectDevice={(id) => onSelectHost?.(id)}
                  />
                ) : (
                  <SystemPerformanceChartWrapper
                    data={systemPerformance}
                    height={280}
                    timeRange={timeRange}
                    hiddenMetrics={hiddenMetrics}
                    annotations={annotations}
                    canReadAlerts={canReadAlerts}
                    yesterdayBaseline={yesterdayBaseline}
                    compareYesterday={compareYesterday}
                    onSelectDevice={onSelectHost ? (id) => onSelectHost(id) : undefined}
                  />
                )
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
              sectionTemperature?.ok === false ? (
                <SectionFailureContent
                  title="设备温度监控"
                  message={sectionTemperature?.message ?? '温度数据加载失败'}
                  onRetry={onRetry}
                  className="h-64"
                />
              ) : temperatureHistory && temperatureHistory.length > 0 ? (
                <TemperatureChartWrapper
                  data={temperatureHistory}
                  height={280}
                  warnThreshold={thresholds?.temperature.warn}
                  critThreshold={thresholds?.temperature.crit}
                  annotations={annotations}
                  canReadAlerts={canReadAlerts}
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
  )
}
