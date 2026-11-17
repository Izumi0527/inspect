'use client'

import { useMemo, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/atoms'
import { cn } from '@/utils/cn'
import {
  MAX_CUSTOM_RANGE_DAYS,
  TIME_RANGE_OPTIONS,
  type CustomDateRangeInfo,
  formatCustomDateRangeSummary,
  formatCustomDateRangeValue,
  formatMonitoringTimeRangeTriggerLabel,
  parseCustomDateRange,
} from '../../utils/monitoring'
import { MonitoringCalendarGrid } from './MonitoringCalendarGrid'

interface MonitoringTimeRangeControlProps {
  /** 当前时间范围档位或自定义区间 YYYY-MM-DD..YYYY-MM-DD */
  timeRange: string
  onTimeRangeChange: (value: string) => void
}

function getTodayInfo(): { year: number; month: number; todayStr: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { year, month, todayStr }
}

function resolveInitialViewMonth(endDate: string | undefined, fallbackYear: number, fallbackMonth: number) {
  if (!endDate) return { year: fallbackYear, month: fallbackMonth }
  const [y, m] = endDate.split('-').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { year: fallbackYear, month: fallbackMonth }
  }
  return { year: y, month: m - 1 }
}

function formatMonthDayLabel(dateStr: string): string {
  return `${dateStr.slice(5, 7)}月${dateStr.slice(8, 10)}日`
}

interface QuickRangeSectionProps {
  timeRange: string
  isCustomActive: boolean
  onSelectPreset: (value: string) => void
}

function QuickRangeSection({ timeRange, isCustomActive, onSelectPreset }: QuickRangeSectionProps) {
  return (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">快捷范围</p>
      <div role="group" aria-label="快捷时间范围" className="grid grid-cols-4 gap-1.5">
        {TIME_RANGE_OPTIONS.map((item) => {
          const active = !isCustomActive && item.value === timeRange
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectPreset(item.value)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-xs transition-colors',
                active
                  ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                  : 'border-border/60 bg-muted/40 text-foreground hover:bg-muted'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}

interface RangeStatusFooterProps {
  draftStart: string | null
  customRange: CustomDateRangeInfo | null
}

function RangeStatusFooter({ draftStart, customRange }: RangeStatusFooterProps) {
  const isCustomHighlighted = !draftStart && customRange !== null
  const text = draftStart
    ? `已选 ${formatMonthDayLabel(draftStart)}，请点选结束日期（最长 ${MAX_CUSTOM_RANGE_DAYS} 天）`
    : customRange
      ? formatCustomDateRangeSummary(customRange.startDate, customRange.endDate)
      : `点选开始和结束日期，最长 ${MAX_CUSTOM_RANGE_DAYS} 天`

  return (
    <div
      className={cn(
        'mt-3 rounded-lg px-3 py-1.5 text-center text-xs',
        isCustomHighlighted ? 'bg-primary/10 font-medium text-primary' : 'bg-muted/60 text-muted-foreground'
      )}
    >
      {text}
    </div>
  )
}

export function MonitoringTimeRangeControl({ timeRange, onTimeRangeChange }: MonitoringTimeRangeControlProps) {
  const today = getTodayInfo()
  const customRange = useMemo(() => parseCustomDateRange(timeRange), [timeRange])
  const triggerLabel = useMemo(() => formatMonitoringTimeRangeTriggerLabel(timeRange), [timeRange])

  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [viewYear, setViewYear] = useState(today.year)
  const [viewMonth, setViewMonth] = useState(today.month)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) return
    setDraftStart(null)
    setHoverDate(null)
    const initial = resolveInitialViewMonth(customRange?.endDate, today.year, today.month)
    setViewYear(initial.year)
    setViewMonth(initial.month)
  }

  const handlePresetClick = (value: string) => {
    setDraftStart(null)
    setHoverDate(null)
    onTimeRangeChange(value)
    setOpen(false)
  }

  const handleDaySelect = (dateStr: string) => {
    if (!draftStart) {
      setDraftStart(dateStr)
      return
    }
    const nextValue = formatCustomDateRangeValue(draftStart, dateStr)
    setDraftStart(null)
    setHoverDate(null)
    onTimeRangeChange(nextValue)
    setOpen(false)
  }

  const shiftMonth = (delta: -1 | 1) => {
    const next = viewMonth + delta
    if (next < 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else if (next > 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(next)
    }
  }

  const canGoNextMonth = viewYear < today.year || (viewYear === today.year && viewMonth < today.month)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-1.5 px-3 py-2 text-sm font-normal"
          aria-label="监控时间范围"
        >
          {customRange && <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />}
          <span>{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3.5">
        <QuickRangeSection
          timeRange={timeRange}
          isCustomActive={customRange !== null}
          onSelectPreset={handlePresetClick}
        />
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-[11px] text-muted-foreground">自定义日期范围</span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <MonitoringCalendarGrid
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedStart={customRange?.startDate ?? null}
          selectedEnd={customRange?.endDate ?? null}
          draftStart={draftStart}
          hoverDate={hoverDate}
          todayStr={today.todayStr}
          canGoNextMonth={canGoNextMonth}
          onPrevMonth={() => shiftMonth(-1)}
          onNextMonth={() => canGoNextMonth && shiftMonth(1)}
          onSelectDay={handleDaySelect}
          onHoverDay={setHoverDate}
        />
        <RangeStatusFooter draftStart={draftStart} customRange={customRange} />
      </PopoverContent>
    </Popover>
  )
}
