import React, { useCallback, useEffect, useRef } from 'react'
import { SmartDateRangePicker } from '@/components/atoms'
import { useDateFilters } from '@/hooks/useDateFilters'

interface DateRange {
  start: string
  end: string
}

export interface AlertTimeRangeFilterValues {
  dateRange?: DateRange
}

interface AlertTimeRangeFilterProps {
  onFilterChange: (filters: AlertTimeRangeFilterValues) => void
  onReset: () => void
  value?: AlertTimeRangeFilterValues
}

// 键名与旧「高级过滤」时代不同：旧缓存里带有关键词/级别/状态等已移除的字段，不再读取
export const ALERT_TIME_RANGE_FILTER_STORAGE_KEY = 'alert_time_range_filter'

const saveFilters = (filters: AlertTimeRangeFilterValues) => {
  try {
    localStorage.setItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch (error) {
    console.error('Failed to save filters:', error)
  }
}

/**
 * AlertTimeRangeFilter 告警时间范围筛选
 *
 * SmartDateRangePicker 的薄包装：负责把选中区间持久化到 localStorage 并在挂载时回放，
 * 以及把「今天 / 本周 / 本月」快捷键映射成具体日期。日历交互全部交给 SmartDateRangePicker。
 */
export const AlertTimeRangeFilter: React.FC<AlertTimeRangeFilterProps> = ({
  onFilterChange,
  onReset,
  value,
}) => {
  const { getDateRange } = useDateFilters()
  const startDate = value?.dateRange?.start ?? ''
  const endDate = value?.dateRange?.end ?? ''

  // SmartDateRangePicker 点选日历时会在同一事件里先后回调 start 与 end，
  // 第二次回调拿到的 props 仍是旧值，因此用 ref 合并，避免前一次的改动被覆盖。
  const rangeRef = useRef<DateRange>({ start: startDate, end: endDate })
  useEffect(() => {
    rangeRef.current = { start: startDate, end: endDate }
  }, [startDate, endDate])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY)
      if (saved) {
        onFilterChange(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error)
    }
  }, [onFilterChange])

  const applyRange = useCallback((patch: Partial<DateRange>) => {
    rangeRef.current = { ...rangeRef.current, ...patch }
    const next: AlertTimeRangeFilterValues = { dateRange: { ...rangeRef.current } }
    saveFilters(next)
    onFilterChange(next)
  }, [onFilterChange])

  const handleClear = useCallback(() => {
    rangeRef.current = { start: '', end: '' }
    localStorage.removeItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY)
    onReset()
  }, [onReset])

  const handleQuickSelect = useCallback((range: 'today' | 'week' | 'month') => {
    const { startDate: start, endDate: end } = getDateRange(range)
    applyRange({ start, end })
  }, [applyRange, getDateRange])

  return (
    <SmartDateRangePicker
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={(date) => applyRange({ start: date })}
      onEndDateChange={(date) => applyRange({ end: date })}
      onClear={handleClear}
      onQuickSelect={handleQuickSelect}
      placeholder="时间范围"
    />
  )
}
