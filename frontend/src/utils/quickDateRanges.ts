/**
 * 日期范围快捷选择（今天 / 本周 / 本月）的唯一定义。
 *
 * 这三个区间同时被 SmartDateRangePicker 的快捷按钮、useDateFilters 与统计报表页使用，
 * 定义只保留在这里，避免同一按钮在不同页面给出不同区间。
 *
 * 口径说明：
 * - 周以周一为一周之始（ISO 周口径，与后端 date_trunc('week') 一致，也与日历首列一致）；
 * - 区间统一截止到「今天」而不是整周/整月末尾，快捷选择的语义是「至今」。
 */

import { formatDateYMD } from './formatters'

export type QuickDateRangeKey = 'today' | 'week' | 'month'

export interface QuickDateRange {
  startDate: string
  endDate: string
}

/** 取本地自然日零点，避免 getDay() 受时分秒/时区影响 */
const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * 本周起点（周一）：ISO 周口径，周一是一周的第一天。
 * getDay() 里周日是 0、周一是 1，先整体左移一天再取模，得到「距本周一的天数」：
 * 周一为 0、周日为 6，回退这些天即落到本周一（周日当天回退 6 天，到上一个周一）。
 */
export const startOfWeek = (now: Date = new Date()): Date => {
  const today = startOfLocalDay(now)
  const daysSinceMonday = (today.getDay() + 6) % 7
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday)
}

/** 本月起点（1 号） */
export const startOfMonth = (now: Date = new Date()): Date =>
  new Date(now.getFullYear(), now.getMonth(), 1)

/** 计算快捷区间；now 可注入，便于测试跨周/跨月边界 */
export function getQuickDateRange(range: QuickDateRangeKey, now: Date = new Date()): QuickDateRange {
  const endDate = formatDateYMD(now)
  switch (range) {
    case 'today':
      return { startDate: endDate, endDate }
    case 'week':
      return { startDate: formatDateYMD(startOfWeek(now)), endDate }
    case 'month':
      return { startDate: formatDateYMD(startOfMonth(now)), endDate }
  }
}

/** 当前区间是否恰好等于某个快捷区间（快捷按钮选中态用） */
export function matchQuickDateRange(
  range: QuickDateRangeKey,
  startDate: string,
  endDate: string,
  now: Date = new Date()
): boolean {
  if (!startDate || !endDate) return false
  const preset = getQuickDateRange(range, now)
  return preset.startDate === startDate && preset.endDate === endDate
}
