import { formatDateYMD } from '@/utils/formatters'

/**
 * 日期快捷筛选Hook
 *
 * 提供常用的日期范围快捷选择功能
 */

export type DateRange = 'today' | 'week' | 'month' | 'custom'

export interface DateFilterResult {
  startDate: string
  endDate: string
}

export const useDateFilters = () => {
  /**
   * 获取今天的日期范围
   */
  const getToday = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dateStr = formatDateYMD(today)

    return {
      startDate: dateStr,
      endDate: dateStr
    }
  }

  /**
   * 获取本周的日期范围（周日到今天）
   */
  const getThisWeek = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())

    return {
      startDate: formatDateYMD(weekStart),
      endDate: formatDateYMD(today)
    }
  }

  /**
   * 获取本月的日期范围（本月1日到今天）
   */
  const getThisMonth = (): DateFilterResult => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    return {
      startDate: formatDateYMD(monthStart),
      endDate: formatDateYMD(today)
    }
  }

  /**
   * 根据快捷类型获取日期范围
   */
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
    getThisMonth
  }
}
