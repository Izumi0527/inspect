'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { MAX_CUSTOM_RANGE_DAYS } from '../../utils/monitoring'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const

export interface MonitoringCalendarGridProps {
  viewYear: number
  viewMonth: number
  selectedStart: string | null
  selectedEnd: string | null
  draftStart: string | null
  hoverDate: string | null
  todayStr: string
  canGoNextMonth: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onSelectDay: (dateStr: string) => void
  onHoverDay: (dateStr: string | null) => void
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseUtcDayMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((part) => Number.parseInt(part, 10))
  return Date.UTC(y, m - 1, d)
}

function diffDaysBetweenStr(a: string, b: string): number {
  return Math.round((parseUtcDayMs(a) - parseUtcDayMs(b)) / 86_400_000)
}

function buildMonthCells(year: number, month: number): (number | null)[] {
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array.from({ length: leadingBlanks }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

function resolveActiveBounds(props: MonitoringCalendarGridProps): [string | null, string | null] {
  if (props.draftStart) {
    const end = props.hoverDate ?? props.draftStart
    return props.draftStart <= end ? [props.draftStart, end] : [end, props.draftStart]
  }
  if (props.selectedStart && props.selectedEnd) {
    return [props.selectedStart, props.selectedEnd]
  }
  return [null, null]
}

interface CalendarMonthNavProps {
  viewYear: number
  viewMonth: number
  canGoNextMonth: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
}

function CalendarMonthNav({
  viewYear,
  viewMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
}: CalendarMonthNavProps) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button
        type="button"
        onClick={onPrevMonth}
        aria-label="上一月"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-semibold text-foreground select-none">
        {viewYear}年{viewMonth + 1}月
      </span>
      <button
        type="button"
        disabled={!canGoNextMonth}
        onClick={onNextMonth}
        aria-label="下一月"
        className={cn(
          'rounded-md p-1 transition-colors',
          canGoNextMonth
            ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
            : 'cursor-not-allowed text-muted-foreground/35'
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

interface DayCellProps {
  day: number
  dateStr: string
  rangeStart: string | null
  rangeEnd: string | null
  draftStart: string | null
  todayStr: string
  onSelectDay: (dateStr: string) => void
  onHoverDay: (dateStr: string | null) => void
}

function DayCell({
  day,
  dateStr,
  rangeStart,
  rangeEnd,
  draftStart,
  todayStr,
  onSelectDay,
  onHoverDay,
}: DayCellProps) {
  const isFuture = dateStr > todayStr
  const exceedsSpan = draftStart !== null && Math.abs(diffDaysBetweenStr(dateStr, draftStart)) >= MAX_CUSTOM_RANGE_DAYS
  const disabled = isFuture || exceedsSpan

  const isStart = rangeStart === dateStr
  const isEnd = rangeEnd === dateStr
  const hasRange = Boolean(rangeStart && rangeEnd && rangeStart !== rangeEnd)
  const inRange = hasRange && rangeStart !== null && rangeEnd !== null && dateStr > rangeStart && dateStr < rangeEnd
  const isToday = dateStr === todayStr

  return (
    <div className="relative flex h-8 items-center justify-center">
      {inRange && <div className="absolute inset-0 bg-primary/12" />}
      {isStart && hasRange && <div className="absolute top-0 bottom-0 right-0 w-1/2 bg-primary/12" />}
      {isEnd && hasRange && <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-primary/12" />}

      <button
        type="button"
        disabled={disabled}
        aria-label={dateStr}
        aria-pressed={isStart || isEnd}
        onClick={() => onSelectDay(dateStr)}
        onMouseEnter={() => onHoverDay(disabled ? null : dateStr)}
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors select-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          disabled && 'cursor-not-allowed text-muted-foreground/35',
          !disabled && (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground',
          !disabled && !isStart && !isEnd && inRange && 'text-foreground hover:bg-primary/20',
          !disabled && !isStart && !isEnd && !inRange && isToday && 'font-semibold text-primary hover:bg-primary/10',
          !disabled && !isStart && !isEnd && !inRange && !isToday && 'text-foreground hover:bg-muted'
        )}
      >
        {day}
        {isToday && !isStart && !isEnd && (
          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
        )}
      </button>
    </div>
  )
}

export function MonitoringCalendarGrid(props: MonitoringCalendarGridProps) {
  const { viewYear, viewMonth, canGoNextMonth, onPrevMonth, onNextMonth, onHoverDay } = props
  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])
  const [rangeStart, rangeEnd] = resolveActiveBounds(props)

  return (
    <div onMouseLeave={() => onHoverDay(null)}>
      <CalendarMonthNav
        viewYear={viewYear}
        viewMonth={viewMonth}
        canGoNextMonth={canGoNextMonth}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="flex h-6 items-center justify-center text-[11px] font-medium text-muted-foreground select-none"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) =>
          day === null ? (
            <div key={`empty-${index}`} className="h-8" />
          ) : (
            <DayCell
              key={formatDateStr(viewYear, viewMonth, day)}
              day={day}
              dateStr={formatDateStr(viewYear, viewMonth, day)}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              draftStart={props.draftStart}
              todayStr={props.todayStr}
              onSelectDay={props.onSelectDay}
              onHoverDay={onHoverDay}
            />
          )
        )}
      </div>
    </div>
  )
}
