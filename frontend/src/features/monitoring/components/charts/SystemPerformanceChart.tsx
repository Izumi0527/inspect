import { useMemo } from 'react'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'
import { resolveTimeWindow } from '../../utils/timeSeries'
import { PERFORMANCE_METRICS, type PerformanceMetricKey } from './PerformanceMetricLegend'
import { TimeSeriesLineChart, type TimeSeriesLine } from './TimeSeriesLineChart'
import type { SystemPerformanceDataPoint } from '../../types'
import type { DashboardAnnotation } from '../../types/zabbix-monitoring.types'

interface SystemPerformanceChartProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  /** 时间范围：决定横轴窗口、刻度步长与标签格式 */
  timeRange?: string
  /** 被用户隐藏的指标（由卡片标题右侧的指标图例控制） */
  hiddenMetrics?: ReadonlySet<PerformanceMetricKey>
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  yesterdayBaseline?: SystemPerformanceDataPoint[]
  compareYesterday?: boolean
  onSelectDevice?: (deviceId: number, deviceName?: string) => void
}

/** 最多绘制的设备数（避免 2 条/台 的曲线过于拥挤，更多设备请用页面顶部设备筛选） */
const MAX_DEVICES = 5

const EMPTY_HIDDEN: ReadonlySet<PerformanceMetricKey> = new Set()

const colorOf = (deviceIndex: number) => DEVICE_SERIES_COLORS[deviceIndex % DEVICE_SERIES_COLORS.length]

const formatPercent = (value: number): string => `${value.toFixed(1)}%`

type DatedPerfPoint = {
  date: Date
  devices: SystemPerformanceDataPoint['devices']
}

type TaggedLine = TimeSeriesLine & { metric: PerformanceMetricKey }

function selectTopDevicesByLoad(
  inWindow: DatedPerfPoint[],
  showCpu: boolean,
  showMemory: boolean,
  maxDevices: number
): { allDeviceNames: string[]; selectedNames: string[] } {
  const allDeviceNames = Array.from(new Set(inWindow.flatMap((point) => Object.keys(point.devices))))
  if (allDeviceNames.length <= maxDevices) {
    return { allDeviceNames, selectedNames: allDeviceNames }
  }

  const scored = allDeviceNames.map((name) => {
    let peak = -Infinity
    let sum = 0
    let count = 0
    for (const point of inWindow) {
      const dev = point.devices[name]
      if (!dev) continue
      if (showCpu && typeof dev.cpu === 'number' && Number.isFinite(dev.cpu)) {
        peak = Math.max(peak, dev.cpu)
        sum += dev.cpu
        count += 1
      }
      if (showMemory && typeof dev.memory === 'number' && Number.isFinite(dev.memory)) {
        peak = Math.max(peak, dev.memory)
        sum += dev.memory
        count += 1
      }
    }
    return {
      name,
      peak: count > 0 ? peak : -Infinity,
      mean: count > 0 ? sum / count : -Infinity,
    }
  })

  scored.sort((a, b) => b.peak - a.peak || b.mean - a.mean || a.name.localeCompare(b.name))
  return {
    allDeviceNames,
    selectedNames: scored.slice(0, maxDevices).map((item) => item.name),
  }
}

function buildYesterdayComparisonLines(
  yesterdayBaseline: SystemPerformanceDataPoint[] | undefined,
  windowStart: number,
  windowEnd: number,
  selectedNames: string[]
): TaggedLine[] {
  if (!yesterdayBaseline || yesterdayBaseline.length === 0) return []
  const inWindow = yesterdayBaseline
    .map((pt) => ({ date: new Date(pt.timestamp), devices: pt.devices }))
    .filter(
      (pt) =>
        !Number.isNaN(pt.date.getTime()) &&
        pt.date.getTime() >= windowStart &&
        pt.date.getTime() <= windowEnd
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (inWindow.length === 0) return []
  const selectedSet = new Set(selectedNames)
  const hasSelected = inWindow.some((pt) =>
    Object.keys(pt.devices).some((name) => selectedSet.has(name))
  )

  const cpuPoints: TimeSeriesLine['points'] = []
  const memPoints: TimeSeriesLine['points'] = []
  for (const pt of inWindow) {
    const entries = Object.entries(pt.devices).filter(
      ([name]) => !hasSelected || selectedSet.has(name)
    )
    if (entries.length === 0) continue
    const cpus = entries.map(([, v]) => v.cpu).filter((v) => typeof v === 'number' && Number.isFinite(v))
    const mems = entries.map(([, v]) => v.memory).filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (cpus.length > 0) {
      cpuPoints.push({ date: pt.date, value: cpus.reduce((a, b) => a + b, 0) / cpus.length })
    }
    if (mems.length > 0) {
      memPoints.push({ date: pt.date, value: mems.reduce((a, b) => a + b, 0) / mems.length })
    }
  }

  const lines: TaggedLine[] = []
  if (cpuPoints.length > 0) {
    lines.push({
      key: 'yesterday:cpu',
      name: '昨日同期 CPU 均值',
      color: 'var(--ink-2)',
      strokeDasharray: '3 3',
      metric: 'cpu',
      points: cpuPoints,
    })
  }
  if (memPoints.length > 0) {
    lines.push({
      key: 'yesterday:memory',
      name: '昨日同期 内存 均值',
      color: 'var(--unknown)',
      strokeDasharray: '3 3',
      metric: 'memory',
      points: memPoints,
    })
  }
  return lines
}

/**
 * 系统性能趋势图（按设备区分）
 *
 * 每台设备绘制 CPU（实线）与内存（虚线）两条曲线：颜色区分设备，线型区分指标。
 * 横轴为真实时间、范围 = 所选时间窗口；某台设备在某时刻没有数据就不画（不补 0），
 * 相邻两点超过两个采样周期即断线，与接口流量图同一口径。
 */
export function SystemPerformanceChart({
  data,
  height = 300,
  showLegend = true,
  className,
  timeRange,
  hiddenMetrics = EMPTY_HIDDEN,
  annotations,
  canReadAlerts = true,
  yesterdayBaseline,
  compareYesterday = false,
  onSelectDevice,
}: SystemPerformanceChartProps) {
  const showCpu = !hiddenMetrics.has('cpu')
  const showMemory = !hiddenMetrics.has('memory')

  const { domain, allDeviceNames, deviceNames, allLines, hasYesterdayLines } = useMemo(() => {
    const dated = data
      .map((point) => ({ date: new Date(point.timestamp), devices: point.devices }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const baselineDates = compareYesterday && yesterdayBaseline
      ? yesterdayBaseline.map((pt) => new Date(pt.timestamp)).filter((d) => !Number.isNaN(d.getTime()))
      : []

    const timeWindow = resolveTimeWindow(timeRange, Date.now(), [
      ...dated.map((point) => point.date),
      ...baselineDates,
    ])
    const startMs = timeWindow[0].getTime()
    const endMs = timeWindow[1].getTime()
    const inWindow = dated.filter(
      (point) => point.date.getTime() >= startMs && point.date.getTime() <= endMs
    )

    const { allDeviceNames: allNames, selectedNames } = selectTopDevicesByLoad(
      inWindow,
      showCpu,
      showMemory,
      MAX_DEVICES
    )

    const deviceLines: TaggedLine[] = selectedNames.flatMap((deviceName, index) =>
      PERFORMANCE_METRICS.map((metric) => ({
        key: `${deviceName}:${metric.key}`,
        name: `${deviceName} ${metric.label}`,
        color: colorOf(index),
        strokeDasharray: metric.strokeDasharray,
        metric: metric.key,
        points: inWindow.flatMap((point) => {
          const value = point.devices[deviceName]?.[metric.key]
          return typeof value === 'number' && Number.isFinite(value) ? [{ date: point.date, value }] : []
        }),
      }))
    )

    const yesterdayLines = compareYesterday
      ? buildYesterdayComparisonLines(yesterdayBaseline, startMs, endMs, selectedNames)
      : []

    return {
      domain: timeWindow,
      allDeviceNames: allNames,
      deviceNames: selectedNames,
      allLines: [...deviceLines, ...yesterdayLines],
      hasYesterdayLines: yesterdayLines.length > 0,
    }
  }, [data, timeRange, showCpu, showMemory, compareYesterday, yesterdayBaseline])

  const lines = useMemo(
    () => allLines.filter((line) => !hiddenMetrics.has(line.metric)),
    [allLines, hiddenMetrics]
  )

  if (allLines.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">暂无性能数据</p>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">已隐藏全部指标</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <TimeSeriesLineChart
        lines={lines}
        domain={domain}
        timeRange={timeRange}
        height={height}
        formatValue={formatPercent}
        annotations={annotations}
        canReadAlerts={canReadAlerts}
        onSelectDevice={onSelectDevice}
        ariaLabel="系统性能趋势图"
      />
      {showLegend && (
        <ul aria-label="设备图例" className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {deviceNames.map((deviceName, index) => (
            <li key={deviceName} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorOf(index) }} />
              <span className="text-sm text-muted-foreground">{deviceName}</span>
            </li>
          ))}
          {compareYesterday && hasYesterdayLines && (
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-ink-2" />
              <span className="text-sm text-muted-foreground">昨日同期基线</span>
            </li>
          )}
          {allDeviceNames.length > MAX_DEVICES && (
            <li className="mt-1 w-full text-center">
              <span className="text-xs text-muted-foreground">
                已按峰值负载精选前 {MAX_DEVICES} / 共 {allDeviceNames.length} 台设备
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
