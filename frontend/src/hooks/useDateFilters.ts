import { formatDateYMD } from '@/utils/formatters'

/**
 * 日期快捷筛选 Hook
 *
 * 提供常用的日期范围快捷选择功能。
 */

export type DateRange = 'today' | 'week' | 'month' | 'custom'

export interface DateFilterResult {
  startDate: string
  endDate: string
}

export const useDateFilters = () => {
  const getToday = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dateStr = formatDateYMD(today)

    return {
      startDate: dateStr,
      endDate: dateStr,
    }
  }

  const getThisWeek = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())

    return {
      startDate: formatDateYMD(weekStart),
      endDate: formatDateYMD(today),
    }
  }

  const getThisMonth = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    return {
      startDate: formatDateYMD(monthStart),
      endDate: formatDateYMD(today),
    }
  }

  const getDateRange = (range: DateRange): DateFilterResult => {
    switch (range) {
      case 'today':
        return getToday()
      case 'week':
        return getThisWeek()
      case 'month':
        return getThisMonth()
      default:
        return { startDate: '', endDate: '' }
    }
  }

  return {
    getDateRange,
    getToday,
    getThisWeek,
    getThisMonth,
  }
}
