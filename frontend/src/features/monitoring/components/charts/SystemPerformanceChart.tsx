import { useMemo } from 'react'
import { LineChartComponent } from '@/components/atoms/charts'
import { formatDateTimeMDHM, formatTimeHM } from '@/utils/formatters'
import { resolveTickStepMinutes, selectTimeTickLabels } from '../../utils/monitoring'
import { PERFORMANCE_METRICS, type PerformanceMetricKey } from './PerformanceMetricLegend'
import type { SystemPerformanceDataPoint } from '../../types'

interface SystemPerformanceChartProps {
  data: SystemPerformanceDataPoint[]
  height?: number
  showLegend?: boolean
  className?: string
  /** 时间范围（用于 x 轴标签格式优化） */
  timeRange?: string
  /** 被用户隐藏的指标（由卡片标题右侧的指标图例控制） */
  hiddenMetrics?: ReadonlySet<PerformanceMetricKey>
}

/** 最多绘制的设备数（避免 2 条/台 的曲线过于拥挤，更多设备请用页面顶部设备筛选） */
const MAX_DEVICES = 5

/** 预定义的设备颜色（与温度图一致，颜色 = 设备） */
const DEVICE_COLORS = [
  '#0891B2', // cyan-600
  '#0EA5E9', // 天蓝色
  '#22C55E', // 绿色
  '#F59E0B', // 橙色
  '#EF4444', // 红色
]

const EMPTY_HIDDEN: ReadonlySet<PerformanceMetricKey> = new Set()

/**
 * 系统性能趋势图（按设备区分）
 *
 * 每台设备绘制 CPU（实线）与内存（虚线）两条曲线：
 * - 颜色区分设备，线型区分指标
 * - 图表下方为设备图例；指标显隐由外部 hiddenMetrics 控制
 */
export function SystemPerformanceChart({
  data,
  height = 300,
  showLegend = true,
  className,
  timeRange,
  hiddenMetrics = EMPTY_HIDDEN,
}: SystemPerformanceChartProps) {
  const showDateOnAxis = useMemo(() => {
    const trimmed = String(timeRange ?? '').trim().toLowerCase()
    const match = /^(\d+)([hdw])$/.exec(trimmed)
    if (!match) return false
    const value = Number.parseInt(match[1], 10)
    const unit = match[2]
    if (!Number.isFinite(value) || value <= 0) return false
    return !(unit === 'h' && value <= 24)
  }, [timeRange])

  const formatTimeLabel = useMemo(() => {
    return (date: Date): string => {
      if (Number.isNaN(date.getTime())) return '-'
      if (!showDateOnAxis) {
        return formatTimeHM(date)
      }
      return formatDateTimeMDHM(date)
    }
  }, [showDateOnAxis])

  // 数据转换：每台设备的 cpu/memory 展平为 `${设备名}:cpu` / `${设备名}:memory` 列
  const { chartData, deviceNames } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], deviceNames: [] }
    }

    const allDeviceNames = Array.from(
      new Set(data.flatMap((point) => Object.keys(point.devices)))
    )
    const limitedDeviceNames = allDeviceNames.slice(0, MAX_DEVICES)

    const transformed = data.map((point) => {
      const dataPoint: Record<string, string | number> = {
        time: formatTimeLabel(new Date(point.timestamp)),
      }
      limitedDeviceNames.forEach((deviceName) => {
        const value = point.devices[deviceName]
        PERFORMANCE_METRICS.forEach((metric) => {
          dataPoint[`${deviceName}:${metric.key}`] = value?.[metric.key] ?? 0
        })
      })
      return dataPoint
    })

    return { chartData: transformed, deviceNames: limitedDeviceNames }
  }, [data, formatTimeLabel])

  // X 轴刻度：按时间范围取步长（1h→5min，以此类推），保证每档约 12 个刻度
  const xTickValues = useMemo(() => {
    if (!timeRange) return undefined
    return selectTimeTickLabels(data, resolveTickStepMinutes(timeRange), formatTimeLabel)
  }, [data, formatTimeLabel, timeRange])

  const colorOf = (deviceIndex: number) => DEVICE_COLORS[deviceIndex % DEVICE_COLORS.length]

  // 曲线 = 设备 × 可见指标
  const lines = useMemo(() => {
    return deviceNames.flatMap((deviceName, index) =>
      PERFORMANCE_METRICS.filter((metric) => !hiddenMetrics.has(metric.key)).map((metric) => ({
        key: `${deviceName}:${metric.key}`,
        name: `${deviceName} ${metric.label}`,
        color: colorOf(index),
        strokeWidth: 2.5,
        strokeDasharray: metric.strokeDasharray,
      }))
    )
  }, [deviceNames, hiddenMetrics])

  const formatter = (value: number | string): string => `${Number(value).toFixed(1)}%`

  // 设备图例
  const DeviceLegend = () => (
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
  )

  if (chartData.length === 0 || deviceNames.length === 0) {
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
      <LineChartComponent
        data={chartData}
        xKey="time"
        lines={lines}
        height={height}
        formatter={formatter}
        xTickValues={xTickValues}
      />
      {showLegend && <DeviceLegend />}
    </div>
  )
}
