import { useMemo } from 'react'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'
import { resolveTimeWindow } from '../../utils/timeSeries'
import { PERFORMANCE_METRICS, type PerformanceMetricKey } from './PerformanceMetricLegend'
import { TimeSeriesLineChart, type TimeSeriesLine } from './TimeSeriesLineChart'
import type { SystemPerformanceDataPoint } from '../../types'

interface SystemPerformanceChartProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  /** 时间范围：决定横轴窗口、刻度步长与标签格式 */
  timeRange?: string
  /** 被用户隐藏的指标（由卡片标题右侧的指标图例控制） */
  hiddenMetrics?: ReadonlySet<PerformanceMetricKey>
}

/** 最多绘制的设备数（避免 2 条/台 的曲线过于拥挤，更多设备请用页面顶部设备筛选） */
const MAX_DEVICES = 5

const EMPTY_HIDDEN: ReadonlySet<PerformanceMetricKey> = new Set()

const colorOf = (deviceIndex: number) => DEVICE_SERIES_COLORS[deviceIndex % DEVICE_SERIES_COLORS.length]

const formatPercent = (value: number): string => `${value.toFixed(1)}%`

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
}: SystemPerformanceChartProps) {
  // 窗口终点取渲染时的当前时间；随数据刷新（data 变化）重新计算，窗口跟着向前滚动
  const { domain, deviceNames, allLines } = useMemo(() => {
    const dated = data
      .map((point) => ({ date: new Date(point.timestamp), devices: point.devices }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const timeWindow = resolveTimeWindow(timeRange, Date.now(), dated.map((point) => point.date))
    const inWindow = dated.filter((point) => point.date.getTime() >= timeWindow[0].getTime())

    const names = Array.from(new Set(inWindow.flatMap((point) => Object.keys(point.devices)))).slice(0, MAX_DEVICES)

    const built: Array<TimeSeriesLine & { metric: PerformanceMetricKey }> = names.flatMap((deviceName, index) =>
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

    return { domain: timeWindow, deviceNames: names, allLines: built }
  }, [data, timeRange])

  const lines = useMemo(
    () => allLines.filter((line) => !hiddenMetrics.has(line.metric)),
    [allLines, hiddenMetrics]
  )

  if (deviceNames.length === 0) {
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
          {deviceNames.length === MAX_DEVICES && (
            <li className="mt-1 w-full text-center">
              <span className="text-xs text-muted-foreground">(最多显示{MAX_DEVICES}个设备)</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
