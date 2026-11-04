import { formatDateTimeMDHM, formatTimeHM } from '@/utils/formatters'
import type { MonitoringSectionKey } from '../types'

export const TIME_RANGE_OPTIONS = [
  { value: '1h', label: '近1小时' },
  { value: '3h', label: '近3小时' },
  { value: '6h', label: '近6小时' },
  { value: '12h', label: '近12小时' },
  { value: '24h', label: '近1天' },
  { value: '3d', label: '近3天' },
  { value: '7d', label: '近7天' },
  { value: '14d', label: '近14天' },
] as const

/** 监控中心默认时间范围 */
export const DEFAULT_TIME_RANGE = '1h'

/**
 * 监控中心页统一采样间隔（分钟）：后端对 1h~14d 所有档位都按 3 分钟分桶，
 * 与采集任务节奏（scheduler.MetricsCollectionInterval，cron 每 3 分钟）相等，每个桶正好一次采集。
 * 改这里必须同步 backend-go/internal/monitoring/queries.go 的 DashboardSampleInterval 与
 * scheduler 的 MetricsCollectionInterval（跨包一致性有守卫测试），此处仅用于界面提示。
 */
export const MONITORING_SAMPLE_INTERVAL_MINUTES = 3

export const MONITORING_SECTION_LABELS: Record<MonitoringSectionKey, string> = {
  stats: '关键指标',
  systemPerformance: '系统性能趋势',
  temperature: '设备温度监控',
  networkTraffic: '网络流量',
}

export function resolveTimeRangeLabel(timeRange: string): string {
  return TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label ?? timeRange
}

/**
 * 数据陈旧阈值（毫秒）：所有档位统一 10 分钟。
 * 采样间隔统一为 3 分钟后，长档位不再有"小时级聚合桶"，原 3d/7d 的 2 小时阈值失去依据；
 * 采集侧每 3 分钟一轮，10 分钟可容忍约三轮采集缺失与网络抖动。
 */
export const MONITORING_DATA_STALE_THRESHOLD_MS = 10 * 60 * 1000

/**
 * X 轴刻度步长（分钟）：每档约 12 个刻度，且步长必须同时满足两个条件：
 * ① 整除 24 小时 → 按 epoch 对齐，刻度落在整点、整 12 点等自然边界；
 * ② 是采样间隔（3 分钟）的整倍数 → 刻度点上真的有数据（5、10 这类步长会落空，
 *    只剩公倍数位置有标签，曲线看起来"少了一大截"）。
 */
const TICK_STEP_MINUTES_BY_RANGE: Readonly<Record<string, number>> = {
  '1h': 6,
  '3h': 15,
  '6h': 30,
  '12h': 60,
  '24h': 120,
  '3d': 360,
  '7d': 720,
  '14d': 1440,
}

export function resolveTickStepMinutes(timeRange: string): number {
  const preset = TICK_STEP_MINUTES_BY_RANGE[timeRange.trim().toLowerCase()]
  if (preset !== undefined) return preset

  // 未知/自定义档位兜底：范围/12 向上取采样间隔的整倍数，保持与固定档位同一条约束
  const sample = MONITORING_SAMPLE_INTERVAL_MINUTES
  const match = /^([0-9]+)([hdw])$/i.exec(timeRange.trim())
  // 无法解析时按「约 2 小时一格」兜底，同样对齐到采样间隔
  if (!match) return Math.ceil(120 / sample) * sample
  const value = Number.parseInt(match[1], 10)
  if (!Number.isFinite(value) || value <= 0) return Math.ceil(120 / sample) * sample
  const unitMinutes = match[2].toLowerCase() === 'h' ? 60 : match[2].toLowerCase() === 'd' ? 1440 : 10080
  const totalMinutes = value * unitMinutes
  return Math.max(sample, Math.ceil(totalMinutes / 12 / sample) * sample)
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

/** 设备曲线调色板（颜色 = 设备），温度图与性能图共用，最多 5 台 */
export const DEVICE_SERIES_COLORS: readonly string[] = [
  '#0891B2', // cyan-600
  '#0EA5E9', // 天蓝色
  '#22C55E', // 绿色
  '#F59E0B', // 橙色
  '#EF4444', // 红色
]

/**
 * X 轴时间标签格式：范围不超过 24h 只显示 时:分；更长范围带上 月/日，避免跨天刻度歧义。
 * 缺省或非法范围按不超过 24h 处理。
 */
export function resolveTimeAxisLabelFormatter(timeRange: string | undefined): (date: Date) => string {
  const showDate = shouldShowDateOnTimeAxis(timeRange)
  return (date: Date): string => {
    if (Number.isNaN(date.getTime())) return '-'
    return showDate ? formatDateTimeMDHM(date) : formatTimeHM(date)
  }
}

function shouldShowDateOnTimeAxis(timeRange: string | undefined): boolean {
  const match = /^(\d+)([hdw])$/.exec(String(timeRange ?? '').trim().toLowerCase())
  if (!match) return false
  const value = Number.parseInt(match[1], 10)
  if (!Number.isFinite(value) || value <= 0) return false
  return !(match[2] === 'h' && value <= 24)
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

/**
 * 格式化带宽值（bps），按 1000 进制自动选择 bps/Kbps/Mbps/Gbps/Tbps：
 * 1001 bps → "1.00 Kbps"，12266 bps → "12.3 Kbps"，≥100 时不带小数。
 * 非有限数或 ≤ 0 统一显示 "0 bps"。
 */
export function formatBandwidthValue(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 bps'

  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  const k = 1000

  const rawIndex = Math.floor(Math.log(bps) / Math.log(k))
  const unitIndex = Math.min(Math.max(rawIndex, 0), units.length - 1)

  const value = bps / Math.pow(k, unitIndex)

  if (value >= 100) {
    return `${value.toFixed(0)} ${units[unitIndex]}`
  } else if (value >= 10) {
    return `${value.toFixed(1)} ${units[unitIndex]}`
  } else {
    return `${value.toFixed(2)} ${units[unitIndex]}`
  }
}
