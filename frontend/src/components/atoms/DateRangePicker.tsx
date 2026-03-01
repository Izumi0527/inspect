import React from 'react'
import { Calendar } from 'lucide-react'
import { format, parseISO, isValid } from 'date-fns'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  minDate?: string
  maxDate?: string
  label?: string
  className?: string
  disabled?: boolean
}

/**
 * DateRangePicker 组件
 * 用于选择日期范围的组件
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minDate,
  maxDate,
  label = '日期范围',
  className = '',
  disabled = false
}) => {
  // 格式化日期显示 (YYYY-MM-DD)
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return ''
    try {
      const date = parseISO(dateString)
      if (isValid(date)) {
        return format(date, 'yyyy-MM-dd')
      }
    } catch {
      // 如果已经是 YYYY-MM-DD 格式,直接返回
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString
      }
    }
    return ''
  }

  // 验证日期范围
  const validateDateRange = (start: string, end: string): boolean => {
    if (!start || !end) return true
    try {
      const startDate = new Date(start)
      const endDate = new Date(end)
      return startDate <= endDate
    } catch {
      return false
    }
  }

  const isValidRange = validateDateRange(startDate, endDate)

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-muted-foreground">
          <Calendar className="w-4 h-4 inline-block mr-1" />
          {label}
        </label>
      )}

      <div className="flex items-center gap-3">
        {/* 开始日期 */}
        <div className="flex-1">
          <input
            type="date"
            value={formatDateForInput(startDate)}
            onChange={(e) => onStartDateChange(e.target.value)}
            min={minDate}
            max={maxDate}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              !isValidRange && startDate && endDate
                ? 'border-red-300 focus:ring-red-500'
                : 'border-border'
            } ${disabled ? 'bg-muted cursor-not-allowed' : 'bg-card'}`}
            aria-label="开始日期"
          />
        </div>

        {/* 分隔符 */}
        <span className="text-muted-foreground font-medium">至</span>

        {/* 结束日期 */}
        <div className="flex-1">
          <input
            type="date"
            value={formatDateForInput(endDate)}
            onChange={(e) => onEndDateChange(e.target.value)}
            min={minDate}
            max={maxDate}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              !isValidRange && startDate && endDate
                ? 'border-red-300 focus:ring-red-500'
                : 'border-border'
            } ${disabled ? 'bg-muted cursor-not-allowed' : 'bg-card'}`}
            aria-label="结束日期"
          />
        </div>
      </div>

      {/* 错误提示 */}
      {!isValidRange && startDate && endDate && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span className="font-medium">⚠</span>
          开始日期不能晚于结束日期
        </p>
      )}
    </div>
  )
}

interface QuickDateRangeButtonsProps {
  onRangeSelect: (startDate: string, endDate: string) => void
  className?: string
}

/**
 * QuickDateRangeButtons 组件
 * 提供快速日期范围选择按钮
 */
export const QuickDateRangeButtons: React.FC<QuickDateRangeButtonsProps> = ({
  onRangeSelect,
  className = ''
}) => {
  const getDateRange = (days: number): { startDate: string; endDate: string } => {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    }
  }

  const quickRanges = [
    { label: '最近7天', days: 7 },
    { label: '最近30天', days: 30 },
    { label: '最近90天', days: 90 }
  ]

  return (
    <div className={`flex gap-2 ${className}`}>
      {quickRanges.map((range) => (
        <button
          key={range.label}
          type="button"
          onClick={() => {
            const { startDate, endDate } = getDateRange(range.days)
            onRangeSelect(startDate, endDate)
          }}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}
