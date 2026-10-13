import { getQuickDateRange, type QuickDateRangeKey } from '@/utils/quickDateRanges'

/**
 * 日期快捷筛选 Hook
 *
 * 区间的具体口径统一在 @/utils/quickDateRanges 定义（周一起算、截止到今天），
 * 这里只做 Hook 形态的包装，保证与 SmartDateRangePicker 快捷按钮、
 * 统计报表页用的是同一套语义。
 */

export type DateRange = QuickDateRangeKey | 'custom'

export interface DateFilterResult {
  startDate: string
  endDate: string
}

export const useDateFilters = () => {
  const getDateRange = (range: DateRange): DateFilterResult => {
    if (range === 'custom') {
      return { startDate: '', endDate: '' }
    }
    return getQuickDateRange(range)
  }

  return {
    getDateRange,
    getToday: (): DateFilterResult => getQuickDateRange('today'),
    getThisWeek: (): DateFilterResult => getQuickDateRange('week'),
    getThisMonth: (): DateFilterResult => getQuickDateRange('month'),
  }
}
