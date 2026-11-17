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

/** 自定义日期范围最大跨度（包含首尾的自然日天数） */
export const MAX_CUSTOM_RANGE_DAYS = 14

export interface CustomDateRangeInfo {
  startDate: string
  endDate: string
  startMs: number
  endMs: number
  days: number
}

const CUSTOM_DATE_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

interface CalendarDateParts {
  year: number
  month: number
  day: number
}

function parseCalendarDateParts(dateStr: string): CalendarDateParts | null {
  const match = CALENDAR_DATE_PATTERN.exec(dateStr)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return { year, month, day }
}

function diffCalendarDays(start: CalendarDateParts, end: CalendarDateParts): number {
  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  return Math.round((endUtc - startUtc) / 86_400_000)
}

export function parseCustomDateRange(timeRange?: string, nowMs?: number): CustomDateRangeInfo | null {
  const match = CUSTOM_DATE_RANGE_PATTERN.exec(String(timeRange ?? '').trim())
  if (!match) return null

  const [, startDate, endDate] = match
  const startParts = parseCalendarDateParts(startDate)
  const endParts = parseCalendarDateParts(endDate)
  if (!startParts || !endParts) return null

  const days = diffCalendarDays(startParts, endParts) + 1
  if (days < 1 || days > MAX_CUSTOM_RANGE_DAYS) return null

  if (nowMs !== undefined && Number.isFinite(nowMs)) {
    const nowDate = new Date(nowMs)
    const todayParts: CalendarDateParts = {
      year: nowDate.getFullYear(),
      month: nowDate.getMonth() + 1,
      day: nowDate.getDate(),
    }
    if (diffCalendarDays(endParts, todayParts) < 0) return null
  }

  const startMs = new Date(startParts.year, startParts.month - 1, startParts.day, 0, 0, 0, 0).getTime()
  const endOfDayMs = new Date(endParts.year, endParts.month - 1, endParts.day, 23, 59, 59, 999).getTime()
  const endMs =
    nowMs !== undefined && Number.isFinite(nowMs) && endOfDayMs > nowMs && startMs <= nowMs
      ? Math.max(startMs + 60_000, nowMs)
      : endOfDayMs

  return { startDate, endDate, startMs, endMs, days }
}

export function formatCustomDateRangeValue(startDate: string, endDate: string): string {
  return startDate <= endDate ? `${startDate}..${endDate}` : `${endDate}..${startDate}`
}

export function isValidMonitoringTimeRange(value: string, nowMs = Date.now()): boolean {
  if (TIME_RANGE_OPTIONS.some((item) => item.value === value)) return true
  return parseCustomDateRange(value, nowMs) !== null
}

export function formatMonitoringTimeRangeTriggerLabel(timeRange: string): string {
  const preset = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)
  if (preset) return preset.label
  const custom = parseCustomDateRange(timeRange)
  if (custom) {
    return `${custom.startDate.slice(5).replace('-', '/')} → ${custom.endDate.slice(5).replace('-', '/')}`
  }
  return timeRange
}

export function formatCustomDateRangeSummary(startDate: string, endDate: string): string {
  const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate]
  const startParts = parseCalendarDateParts(start)
  const endParts = parseCalendarDateParts(end)
  const days = startParts && endParts ? diffCalendarDays(startParts, endParts) + 1 : 1
  return `${start.slice(5, 7)}月${start.slice(8, 10)}日 — ${end.slice(5, 7)}月${end.slice(8, 10)}日，共 ${days} 天`
}

/**
 * 监控中心页统一采样间隔（分钟）：后端对 1h~14d 所有档位都按 5 分钟分桶，
 * 与采集任务节奏（scheduler.MetricsCollectionInterval，cron 每 5 分钟）相等，每个桶正好一次采集。
 * 改这里必须同步 backend-go/internal/monitoring/queries.go 的 DashboardSampleInterval 与
 * scheduler 的 MetricsCollectionInterval（跨包一致性有守卫测试）。此处用于界面提示，
 * 以及时间轴图表的缺口判定（相邻两点超过 2 个采样间隔即断线，见 utils/timeSeries.ts）；
 * 总览拓扑的 EmptyLinksHint 文案也写了采集节奏，需一并修改。
 */
export const MONITORING_SAMPLE_INTERVAL_MINUTES = 5

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
 * 数据陈旧阈值（毫秒）：所有档位统一 15 分钟。
 * 页面各档位统一按采样间隔分桶后，长档位不再有"小时级聚合桶"，原 3d/7d 的 2 小时阈值失去依据；
 * 采集侧每 5 分钟一轮，15 分钟可完整容忍一轮采集缺失与网络抖动；数据年龄从最新桶的起点算，
 * 连续缺两轮时会在第三轮数据到达前短暂提示。
 */
export const MONITORING_DATA_STALE_THRESHOLD_MS = 15 * 60 * 1000

/**
 * X 轴刻度步长（分钟）：每档约 12 个刻度，且步长必须同时满足两个条件：
 * ① 整除 24 小时 → 按 epoch 对齐，刻度落在整点、整 12 点等自然边界；
 * ② 是采样间隔（5 分钟）的整倍数 → 刻度落在采样时刻上，悬停吸附到的数据点与刻度对齐。
 * 三张监控图都是时间轴，刻度由 utils/timeSeries.ts 的 buildTimeAxisTicks 按步长生成。
 */
const TICK_STEP_MINUTES_BY_RANGE: Readonly<Record<string, number>> = {
  '1h': 5,
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

  const custom = parseCustomDateRange(timeRange)
  if (custom) {
    if (custom.days === 1) return 120
    if (custom.days <= 3) return 360
    if (custom.days <= 7) return 720
    return 1440
  }

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
 * 设备曲线调色板（颜色 = 设备），温度图与性能图共用，最多 5 台。
 * 经 dataviz 调色板校验：在浅色卡片 #ffffff 与暗色卡片 #191f23 上，相邻色色盲 ΔE ≥ 8.4、
 * 正常视觉 ΔE ≥ 19.3、对比度均 ≥ 3:1，一套色值两种主题通用；不含红色（红色是告警「严重」的状态色）。
 * 与 PDF 侧 pdfkit.DeviceSeriesPalette 逐色一致，改色必须两端同步。
 */
export const DEVICE_SERIES_COLORS: readonly string[] = [
  '#3987E5', // 蓝
  '#D95926', // 橙
  '#199E70', // 青绿
  '#C98500', // 金
  '#D55181', // 品红
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

export function shouldShowDateOnTimeAxis(timeRange: string | undefined): boolean {
  const custom = parseCustomDateRange(timeRange)
  if (custom) return custom.days > 1

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
