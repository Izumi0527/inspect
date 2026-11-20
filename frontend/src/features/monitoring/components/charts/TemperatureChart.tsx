import { useMemo } from 'react'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'
import { resolveTimeWindow } from '../../utils/timeSeries'
import {
  TimeSeriesLineChart,
  type ChartReferenceLine,
  type TimeSeriesLine,
} from './TimeSeriesLineChart'
import type { TemperatureDataPoint } from '../../types'
import type { DashboardAnnotation } from '../../types/zabbix-monitoring.types'

interface TemperatureChartProps {
  data: TemperatureDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  /** 预警温度阈值（来自监控规则动态阈值） */
  warnThreshold?: number
  /** 严重温度阈值（来自监控规则动态阈值） */
  critThreshold?: number
  /** 兼容旧单阈值入参（无默认值，不硬编码 75） */
  temperatureThreshold?: number
  annotations?: DashboardAnnotation[]
  canReadAlerts?: boolean
  /** 时间范围：决定横轴窗口、刻度步长与标签格式 */
  timeRange?: string
}

/** 最多绘制的设备数（避免曲线过于拥挤，更多设备请用页面顶部设备筛选） */
const MAX_DEVICES = 5

const formatCelsius = (value: number): string => `${value.toFixed(1)}°C`

/**
 * 设备温度监控图
 *
 * 消费动态阈值（Warn/Crit）渲染双警戒虚线与事件标注点，彻底移除前端硬编码阈值。
 */
export function TemperatureChart({
  data,
  height = 300,
  showLegend = true,
  className,
  warnThreshold,
  critThreshold,
  temperatureThreshold,
  annotations,
  canReadAlerts = true,
  timeRange,
}: TemperatureChartProps) {
  const effectiveWarn = warnThreshold ?? temperatureThreshold
  const effectiveCrit = critThreshold

  const { domain, lines } = useMemo(() => {
    const dated = data
      .map((point) => ({ date: new Date(point.timestamp), devices: point.devices }))
      .filter((point) => !Number.isNaN(point.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const timeWindow = resolveTimeWindow(
      timeRange,
      Date.now(),
      dated.map((point) => point.date)
    )
    const inWindow = dated.filter(
      (point) =>
        point.date.getTime() >= timeWindow[0].getTime() &&
        point.date.getTime() <= timeWindow[1].getTime()
    )

    const names = Array.from(
      new Set(inWindow.flatMap((point) => Object.keys(point.devices)))
    ).slice(0, MAX_DEVICES)

    const built: TimeSeriesLine[] = names.map((deviceName, index) => ({
      key: deviceName,
      name: deviceName,
      color: DEVICE_SERIES_COLORS[index % DEVICE_SERIES_COLORS.length],
      points: inWindow.flatMap((point) => {
        const value = point.devices[deviceName]
        return typeof value === 'number' && Number.isFinite(value)
          ? [{ date: point.date, value }]
          : []
      }),
    }))

    return { domain: timeWindow, lines: built }
  }, [data, timeRange])

  const referenceLines = useMemo<ChartReferenceLine[]>(() => {
    const refs: ChartReferenceLine[] = []
    if (typeof effectiveWarn === 'number' && Number.isFinite(effectiveWarn)) {
      refs.push({
        key: 'temp-warn',
        value: effectiveWarn,
        label: `预警 ${effectiveWarn}°C`,
        color: 'var(--warning)',
        strokeDasharray: '5 4',
      })
    }
    if (typeof effectiveCrit === 'number' && Number.isFinite(effectiveCrit)) {
      refs.push({
        key: 'temp-crit',
        value: effectiveCrit,
        label: `严重 ${effectiveCrit}°C`,
        color: 'var(--danger)',
        strokeDasharray: '4 3',
      })
    }
    return refs
  }, [effectiveWarn, effectiveCrit])

  const alertLimit = effectiveWarn ?? effectiveCrit
  const formatTooltipValue = (value: number): string =>
    alertLimit !== undefined && value >= alertLimit
      ? `${formatCelsius(value)} [!]`
      : formatCelsius(value)

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
        referenceLines={referenceLines}
        annotations={annotations}
        canReadAlerts={canReadAlerts}
        ariaLabel="设备温度监控图"
      />
      {showLegend && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {lines.map((line) => {
            const hasHighTemp =
              alertLimit !== undefined &&
              line.points.some((point) => point.value >= alertLimit)

            return (
              <div key={line.key} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {line.name}
                  {hasHighTemp && (
                    <span className="ml-1 text-xs font-semibold text-warning">[!]</span>
                  )}
                </span>
              </div>
            )
          })}
          {lines.length === MAX_DEVICES && (
            <div className="mt-1 w-full text-center">
              <span className="text-xs text-muted-foreground">
                (最多显示{MAX_DEVICES}个设备)
              </span>
            </div>
          )}
        </div>
      )}

      {(effectiveWarn !== undefined || effectiveCrit !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground tabular-nums">
          {effectiveWarn !== undefined && (
            <span>预警阈值: <strong className="font-medium text-warning">{effectiveWarn}°C</strong></span>
          )}
          {effectiveCrit !== undefined && (
            <span>严重阈值: <strong className="font-medium text-danger">{effectiveCrit}°C</strong></span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-warning">[!]</span>
            <span>超阈值警告</span>
          </span>
        </div>
      )}
    </div>
  )
}
