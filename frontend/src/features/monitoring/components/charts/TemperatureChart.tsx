import { useMemo } from 'react'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'
import { resolveTimeWindow } from '../../utils/timeSeries'
import { TimeSeriesLineChart, type TimeSeriesLine } from './TimeSeriesLineChart'
import type { TemperatureDataPoint } from '../../types'

interface TemperatureChartProps {
  data: TemperatureDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  temperatureThreshold?: number // 温度阈值,超过此值高亮显示
  /** 时间范围：决定横轴窗口、刻度步长与标签格式 */
  timeRange?: string
}

/** 最多绘制的设备数（避免曲线过于拥挤，更多设备请用页面顶部设备筛选） */
const MAX_DEVICES = 5

const formatCelsius = (value: number): string => `${value.toFixed(1)}°C`

/**
 * 设备温度监控图
 *
 * 每台设备一条温度曲线（颜色区分设备），图例对超阈值设备加 [!] 标记。
 * 横轴为真实时间、范围 = 所选时间窗口；某台设备在某时刻没有数据就不画（不补 0℃），
 * 相邻两点超过两个采样周期即断线，与系统性能趋势、接口流量图同一口径。
 */
export function TemperatureChart({
  data,
  height = 300,
  showLegend = true,
  className,
  temperatureThreshold = 75, // 默认75°C为阈值
  timeRange,
}: TemperatureChartProps) {
  // 窗口终点取渲染时的当前时间；随数据刷新（data 变化）重新计算，窗口跟着向前滚动
  const { domain, lines } = useMemo(() => {
    const dated = data
      .map((point) => ({ date: new Date(point.timestamp), devices: point.devices }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const timeWindow = resolveTimeWindow(timeRange, Date.now(), dated.map((point) => point.date))
    const inWindow = dated.filter((point) => point.date.getTime() >= timeWindow[0].getTime())

    const names = Array.from(new Set(inWindow.flatMap((point) => Object.keys(point.devices)))).slice(0, MAX_DEVICES)

    const built: TimeSeriesLine[] = names.map((deviceName, index) => ({
      key: deviceName,
      name: deviceName,
      color: DEVICE_SERIES_COLORS[index % DEVICE_SERIES_COLORS.length],
      points: inWindow.flatMap((point) => {
        const value = point.devices[deviceName]
        return typeof value === 'number' && Number.isFinite(value) ? [{ date: point.date, value }] : []
      }),
    }))

    return { domain: timeWindow, lines: built }
  }, [data, timeRange])

  // 提示框里超过阈值的温度加警告标识（纵轴刻度不加）
  const formatTooltipValue = (value: number): string =>
    value >= temperatureThreshold ? `${formatCelsius(value)} [!]` : formatCelsius(value)

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">暂无温度数据</p>
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
        formatValue={formatCelsius}
        formatTooltipValue={formatTooltipValue}
        ariaLabel="设备温度监控图"
      />
      {showLegend && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {lines.map((line) => {
            // 该设备在窗口内是否有温度超过阈值
            const hasHighTemp = line.points.some((point) => point.value >= temperatureThreshold)

            return (
              <div key={line.key} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: line.color }} />
                <span className="text-sm text-muted-foreground">
                  {line.name}
                  {hasHighTemp && <span className="ml-1 text-xs font-semibold text-orange-500">[!]</span>}
                </span>
              </div>
            )
          })}
          {lines.length === MAX_DEVICES && (
            <div className="mt-1 w-full text-center">
              <span className="text-xs text-muted-foreground">(最多显示{MAX_DEVICES}个设备)</span>
            </div>
          )}
        </div>
      )}

      {/* 温度阈值提示 */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>温度阈值:</span>
          <span className="font-medium">{temperatureThreshold}°C</span>
        </div>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-orange-500">[!]</span>
          <span>超阈值警告</span>
        </div>
      </div>
    </div>
  )
}
