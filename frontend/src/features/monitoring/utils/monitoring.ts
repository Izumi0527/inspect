import type { MonitoringSectionKey } from '../types'

export const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '近24小时' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
] as const

export const MONITORING_SECTION_LABELS: Record<MonitoringSectionKey, string> = {
  stats: '关键指标',
  systemPerformance: '系统性能趋势',
  temperature: '设备温度监控',
  deviceStatus: '设备状态分布',
  availability: '整体可用性',
  networkTraffic: '网络流量',
  realtimeAlerts: '实时告警',
}

export function resolveTimeRangeLabel(timeRange: string): string {
  return TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label ?? timeRange
}

export function resolveMonitoringDataStaleThresholdMs(timeRange: string): number {
  switch (timeRange) {
    case '24h':
      // 近24小时：按分钟级采集/聚合，容忍桶边界与网络抖动
      return 10 * 60 * 1000
    case '7d':
      // 近7天：通常按小时级聚合
      return 2 * 60 * 60 * 1000
    case '30d':
      // 近30天：通常按小时/天级聚合
      // 后端默认 6 小时一个桶，为避免桶边界误报，阈值取更宽松的 12 小时。
      return 12 * 60 * 60 * 1000
    default:
      return 10 * 60 * 1000
  }
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
