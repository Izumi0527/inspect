import type { MonitoringSectionKey } from '../types'

export const TIME_RANGE_OPTIONS = [
  { value: '1h', label: '近1小时' },
  { value: '12h', label: '近12小时' },
  { value: '24h', label: '近24小时' },
  { value: '3d', label: '近3天' },
  { value: '7d', label: '近7天' },
] as const

/** 监控中心默认时间范围 */
export const DEFAULT_TIME_RANGE = '1h'

export const MONITORING_SECTION_LABELS: Record<MonitoringSectionKey, string> = {
  stats: '关键指标',
  systemPerformance: '系统性能趋势',
  temperature: '设备温度监控',
  deviceStatus: '设备状态分布',
  networkTraffic: '网络流量',
  realtimeAlerts: '实时告警',
}

export function resolveTimeRangeLabel(timeRange: string): string {
  return TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label ?? timeRange
}

export function resolveMonitoringDataStaleThresholdMs(timeRange: string): number {
  switch (timeRange) {
    case '1h':
    case '12h':
    case '24h':
      // 5 分钟采集 + 5 分钟桶：容忍两轮采集缺失与网络抖动
      return 10 * 60 * 1000
    case '3d':
    case '7d':
      // 小时级聚合桶，为避免桶边界误报取 2 小时
      return 2 * 60 * 60 * 1000
    default:
      return 10 * 60 * 1000
  }
}

/**
 * X 轴刻度步长（分钟）：范围/12，保证每档约 12 个刻度
 * （1h→5min、12h→1h、24h→2h、3d→6h、7d→14h）
 */
export function resolveTickStepMinutes(timeRange: string): number {
  switch (timeRange) {
    case '1h':
      return 5
    case '12h':
      return 60
    case '24h':
      return 120
    case '3d':
      return 360
    case '7d':
      return 840
    default: {
      const match = /^([0-9]+)([hdw])$/i.exec(timeRange.trim())
      if (!match) return 120
      const value = Number.parseInt(match[1], 10)
      if (!Number.isFinite(value) || value <= 0) return 120
      const unitMinutes = match[2].toLowerCase() === 'h' ? 60 : match[2].toLowerCase() === 'd' ? 1440 : 10080
      const totalMinutes = value * unitMinutes
      return Math.max(5, Math.ceil(totalMinutes / 12 / 5) * 5)
    }
  }
}

/**
 * 从时序数据点中挑出落在刻度步长上的点，返回格式化后的 X 轴刻度标签。
 * 步长整除 24h 时按 epoch 对齐（刻度落在整点/整 5 分钟等自然边界）；
 * 否则（如 7d 档的 14h 步长）以首个数据点为锚均匀取刻度。
 */
export function selectTimeTickLabels(
  points: ReadonlyArray<{ timestamp: Date | string }>,
  stepMinutes: number,
  format: (date: Date) => string
): string[] {
  if (points.length === 0 || stepMinutes <= 0) return []

  const stepMs = stepMinutes * 60_000
  const dayMs = 24 * 60 * 60_000
  const alignedToEpoch = dayMs % stepMs === 0

  const times: number[] = []
  for (const point of points) {
    const date = point.timestamp instanceof Date ? point.timestamp : new Date(point.timestamp)
    const time = date.getTime()
    if (!Number.isNaN(time)) {
      times.push(time)
    }
  }
  if (times.length === 0) return []

  const anchor = alignedToEpoch ? 0 : times[0]
  const labels: string[] = []
  for (const time of times) {
    if ((time - anchor) % stepMs !== 0) continue
    labels.push(format(new Date(time)))
  }
  return labels
}

export function formatDurationFromMs(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const seconds = Math.floor(safeMs / 1000)
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`

  const days = Math.floor(hours / 24)
  return `${days} 天`
}
