/**
 * 统计分析页面纯展示与计算工具。
 * 统一时间周期口径、涨跌趋势解析、图表去套娃样式与分布数据规范化。
 */

import { formatDateYMD } from '@/utils/formatters'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'

export type AnalyticsPeriod = 'day' | 'week' | 'month'

export interface AnalyticsPeriodOption {
  value: AnalyticsPeriod
  label: string
}

export const ANALYTICS_PERIOD_OPTIONS: readonly AnalyticsPeriodOption[] = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
] as const

export const ANALYTICS_CHART_UNWRAPPED_CLASS =
  'rounded-none border-0 bg-transparent p-0 backdrop-blur-none shadow-none'

const DEVICE_SEMANTIC_COLORS = [
  'var(--brand)',
  'var(--info)',
  'var(--success)',
  'var(--warning)',
  'var(--danger)',
] as const

export function getComparisonBaselineLabel(period: AnalyticsPeriod): string {
  switch (period) {
    case 'day':
      return 'vs 前一日'
    case 'month':
      return 'vs 上月'
    case 'week':
    default:
      return 'vs 上周'
  }
}

/**
 * 基于本地日历生成统计日期区间（不调用 toISOString，避免 UTC 跨日偏移）。
 * 口径与后端 resolveTrendRange 严格对齐：day=近7自然日，week=近4周(28天)，month=近12个自然月。
 */
export function buildAnalyticsDateRange(
  period: AnalyticsPeriod,
  now: Date = new Date()
): { startDate: string; endDate: string } {
  const endDate = formatDateYMD(now)
  const start = (() => {
    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      case 'month':
        return new Date(now.getFullYear(), now.getMonth() - 11, 1)
      case 'week':
      default:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27)
    }
  })()
  return {
    startDate: formatDateYMD(start),
    endDate,
  }
}

/**
 * 格式化趋势时间标签；优先按 YYYY-MM-DD 字符串切分，规避时区偏移。
 */
export function formatAnalyticsDateLabel(dateStr: string, period: AnalyticsPeriod): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim())
  if (matched) {
    const [, year, month, day] = matched
    return period === 'month' ? `${year}/${month}` : `${month}/${day}`
  }

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    return dateStr
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return period === 'month' ? `${date.getFullYear()}/${month}` : `${month}/${day}`
}

export interface ParsedChangeTrend {
  direction: 'up' | 'down' | 'flat'
  arrow: '↗' | '↘' | '→'
  colorClass: string
  display: string
}

/**
 * 解析环比变化字符串并生成真实方向、箭头、语义颜色与展示文案。
 */
export function parseChangeTrend(change?: string): ParsedChangeTrend {
  const raw = (change ?? '').trim()
  if (!raw) {
    return {
      direction: 'flat',
      arrow: '→',
      colorClass: 'text-muted-foreground',
      display: '0.0%',
    }
  }

  const numMatch = /^[+-]?\d+(?:\.\d+)?/.exec(raw)
  if (!numMatch) {
    return {
      direction: 'flat',
      arrow: '→',
      colorClass: 'text-muted-foreground',
      display: /^(?:[+-]?(?:nan|infinity))/i.test(raw) ? '0.0%' : raw,
    }
  }

  const value = Number(numMatch[0])
  if (!Number.isFinite(value) || value === 0) {
    return {
      direction: 'flat',
      arrow: '→',
      colorClass: 'text-muted-foreground',
      display: raw,
    }
  }

  if (value > 0) {
    return {
      direction: 'up',
      arrow: '↗',
      colorClass: 'text-success',
      display: raw.startsWith('+') ? raw : `+${raw}`,
    }
  }

  return {
    direction: 'down',
    arrow: '↘',
    colorClass: 'text-danger',
    display: raw,
  }
}

export interface TrendSummary {
  totalExecutions: number
  totalSuccess: number
  totalFailed: number
  avgScore: number
  minScore: number
  maxScore: number
  hasScorePoints: boolean
}

/**
 * 汇总时间窗口内各周期趋势数据（排除零执行的空槽对最低/平均分的干扰）。
 */
export function summarizeTrends(
  trends?: Array<{ executions?: number; success?: number; failed?: number; avgScore?: number }>
): TrendSummary {
  if (!Array.isArray(trends) || trends.length === 0) {
    return {
      totalExecutions: 0,
      totalSuccess: 0,
      totalFailed: 0,
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      hasScorePoints: false,
    }
  }

  let totalExecutions = 0
  let totalSuccess = 0
  let totalFailed = 0
  let scoreSum = 0
  let scoreCount = 0
  let minScore = Infinity
  let maxScore = -Infinity

  for (const item of trends) {
    if (!item) continue
    const executions =
      typeof item.executions === 'number' && Number.isFinite(item.executions) && item.executions > 0
        ? item.executions
        : 0
    const success =
      typeof item.success === 'number' && Number.isFinite(item.success) && item.success > 0
        ? item.success
        : 0
    const failed =
      typeof item.failed === 'number' && Number.isFinite(item.failed) && item.failed > 0
        ? item.failed
        : 0
    const avgScore =
      typeof item.avgScore === 'number' && Number.isFinite(item.avgScore) ? item.avgScore : 0

    totalExecutions += executions
    totalSuccess += success
    totalFailed += failed

    if (success > 0 || avgScore > 0) {
      const clampedScore = Math.max(0, Math.min(100, avgScore))
      scoreSum += clampedScore
      scoreCount += 1
      if (clampedScore < minScore) minScore = clampedScore
      if (clampedScore > maxScore) maxScore = clampedScore
    }
  }

  if (scoreCount === 0) {
    return {
      totalExecutions,
      totalSuccess,
      totalFailed,
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      hasScorePoints: false,
    }
  }

  return {
    totalExecutions,
    totalSuccess,
    totalFailed,
    avgScore: scoreSum / scoreCount,
    minScore,
    maxScore,
    hasScorePoints: true,
  }
}

export interface NormalizedDeviceItem {
  name: string
  value: number
  color: string
}

/**
 * 规范化设备类型分布：翻译中文设备名、合并同类、降序排列并分配三皮肤语义色。
 */
export function normalizeDeviceDistribution(
  items?: Array<{ name?: string; value?: number; color?: string }>
): { items: NormalizedDeviceItem[]; totalDevices: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], totalDevices: 0 }
  }

  const merged = new Map<string, { value: number; fallbackColor?: string }>()
  for (const item of items) {
    const count = typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : 0
    if (count <= 0) continue

    const label = getDeviceTypeLabel(item.name)
    const existing = merged.get(label)
    if (existing) {
      existing.value += count
    } else {
      merged.set(label, { value: count, fallbackColor: item.color })
    }
  }

  const sorted = Array.from(merged.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, entry], index) => ({
      name,
      value: entry.value,
      color:
        index < DEVICE_SEMANTIC_COLORS.length
          ? DEVICE_SEMANTIC_COLORS[index]
          : 'var(--muted-foreground)',
    }))

  const totalDevices = sorted.reduce((sum, item) => sum + item.value, 0)
  return { items: sorted, totalDevices }
}

export interface ProblemRankingItem {
  category: string
  count: number
  percent: number
  barPercent: number
}

/**
 * 规范化常见问题分布为降序排行与占比进度数据。
 */
export function normalizeProblemRanking(
  items?: Array<{ category?: string; count?: number }>
): { items: ProblemRankingItem[]; totalProblems: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], totalProblems: 0 }
  }

  const merged = new Map<string, number>()
  for (const item of items) {
    const count = typeof item.count === 'number' && Number.isFinite(item.count) ? item.count : 0
    if (count <= 0) continue
    const category = (item.category ?? '').trim() || '其他'
    merged.set(category, (merged.get(category) ?? 0) + count)
  }

  const sorted = Array.from(merged.entries()).sort((a, b) => b[1] - a[1])
  const totalProblems = sorted.reduce((sum, [, count]) => sum + count, 0)

  const ranking: ProblemRankingItem[] = sorted.map(([category, count]) => {
    const percent = totalProblems > 0 ? (count / totalProblems) * 100 : 0
    const barPercent = Math.max(4, Math.min(100, percent))
    return {
      category,
      count,
      percent,
      barPercent,
    }
  })

  return { items: ranking, totalProblems }
}
