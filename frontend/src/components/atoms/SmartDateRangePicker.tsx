'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X, Zap } from 'lucide-react'
import { cn } from '@/utils/cn'

// ── Types ──────────────────────────────────────────────────────────────────

interface SmartDateRangePickerProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClear?: () => void
  onQuickSelect?: (range: 'today' | 'week' | 'month') => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

interface PanelPosition {
  top: number
  left: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const QUICK_PRESETS = [
  { key: 'today' as const, label: '今天' },
  { key: 'week' as const, label: '本周' },
  { key: 'month' as const, label: '本月' },
]

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const PANEL_WIDTH = 288 // w-72

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayDateStr(): string {
  const t = new Date()
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
}

function getInitialMonth(dateStr: string): Date {
  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1)
  }
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

/** YYYY-MM-DD → MM/DD 紧凑显示 */
function formatShort(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr
}

/** YYYY-MM-DD → YYYY年MM月DD日 */
function formatFull(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : dateStr
}

// ── CalendarGrid ───────────────────────────────────────────────────────────

interface CalendarGridProps {
  startDate: string
  endDate: string
  currentMonth: Date
  onDayClick: (dateStr: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

const CalendarGrid: React.FC<CalendarGridProps> = React.memo(({
  startDate,
  endDate,
  currentMonth,
  onDayClick,
  onPrevMonth,
  onNextMonth,
}) => {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const today = todayDateStr()

  const cells = useMemo<(number | null)[]>(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: (number | null)[] = []
    for (let i = 0; i < firstDayOfWeek; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(d)
    return result
  }, [year, month])

  return (
    <div>
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="上个月"
          className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground select-none">
          {year}年{String(month + 1).padStart(2, '0')}月
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="下个月"
          className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="h-7 flex items-center justify-center text-xs font-medium text-muted-foreground/60 select-none"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="h-9" />

          const dateStr = toDateStr(year, month, day)
          const isStart = !!startDate && dateStr === startDate
          const isEnd = !!endDate && dateStr === endDate
          const hasRange = !!(startDate && endDate && startDate !== endDate)
          const isInRange = hasRange && dateStr > startDate && dateStr < endDate
          const isToday = dateStr === today

          return (
            <div key={dateStr} className="relative h-9 flex items-center justify-center">
              {/* 范围背景条 */}
              {isInRange && <div className="absolute inset-0 bg-primary/12" />}
              {isStart && hasRange && <div className="absolute top-0 bottom-0 right-0 w-1/2 bg-primary/12" />}
              {isEnd && hasRange && <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-primary/12" />}

              {/* 日期按钮 */}
              <button
                type="button"
                onClick={() => onDayClick(dateStr)}
                aria-label={`${year}年${month + 1}月${day}日`}
                aria-pressed={isStart || isEnd}
                className={cn(
                  'relative z-10 w-8 h-8 flex items-center justify-center',
                  'text-sm rounded-full transition-all duration-100 cursor-pointer select-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  (isStart || isEnd) && 'bg-primary text-primary-foreground font-semibold shadow-sm',
                  isToday && !isStart && !isEnd && 'text-primary font-bold',
                  !isStart && !isEnd && !isToday && 'text-foreground',
                  !isStart && !isEnd && 'hover:bg-primary/15',
                )}
              >
                {day}
                {isToday && !isStart && !isEnd && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
})

CalendarGrid.displayName = 'CalendarGrid'

// ── SmartDateRangePicker ───────────────────────────────────────────────────

export const SmartDateRangePicker: React.FC<SmartDateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  onQuickSelect,
  className,
  placeholder = '选择日期范围',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => getInitialMonth(startDate))
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')
  const [syncMonth, setSyncMonth] = useState(false)
  // Panel position（fixed 定位坐标，由 getBoundingClientRect 计算）
  const [panelPos, setPanelPos] = useState<PanelPosition>({ top: 0, left: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const hasAnyDate = !!(startDate || endDate)
  const hasBothDates = !!(startDate && endDate)

  // 计算面板位置（fixed 坐标）
  const calcPanelPosition = useCallback((): PanelPosition => {
    if (!triggerRef.current) return { top: 0, left: 0 }
    const rect = triggerRef.current.getBoundingClientRect()
    let left = rect.left
    // 防止右侧溢出
    if (left + PANEL_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - PANEL_WIDTH - 8
    }
    return { top: rect.bottom + 8, left }
  }, [])

  // 打开面板（计算定位 + 初始化状态）
  const handleOpen = useCallback(() => {
    if (disabled) return
    setPanelPos(calcPanelPosition())
    setCurrentMonth(getInitialMonth(startDate))
    setSelecting(hasBothDates ? 'start' : startDate ? 'end' : 'start')
    setOpen(true)
  }, [disabled, startDate, hasBothDates, calcPanelPosition])

  const handleToggle = useCallback(() => {
    if (open) { setOpen(false) } else { handleOpen() }
  }, [open, handleOpen])

  // 面板打开时：scroll/resize 同步更新 fixed 位置
  useEffect(() => {
    if (!open) return
    const update = () => setPanelPos(calcPanelPosition())
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, calcPanelPosition])

  // 点击外部 / ESC 关闭（panelRef 已在 document.body，需单独判断）
  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // 快速预设后同步日历月份
  useEffect(() => {
    if (syncMonth && startDate) {
      const d = new Date(startDate + 'T00:00:00')
      if (!isNaN(d.getTime())) {
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      }
      setSyncMonth(false)
    }
  }, [syncMonth, startDate])

  // 点击日期格子
  const handleDayClick = useCallback((dateStr: string) => {
    if (selecting === 'start') {
      onStartDateChange(dateStr)
      onEndDateChange('')
      setSelecting('end')
    } else {
      if (!startDate || dateStr < startDate) {
        onStartDateChange(dateStr)
        onEndDateChange('')
        // 继续选结束日期
      } else {
        onEndDateChange(dateStr)
        setSelecting('start')
      }
    }
  }, [selecting, startDate, onStartDateChange, onEndDateChange])

  const handleQuickSelect = useCallback((range: 'today' | 'week' | 'month') => {
    onQuickSelect?.(range)
    setSelecting('start')
    setSyncMonth(true)
  }, [onQuickSelect])

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  // 状态栏文案
  const statusInfo = useMemo(() => {
    if (!startDate && !endDate) return { text: '请点击日历选择开始日期', variant: 'hint' as const }
    if (startDate && !endDate) return { text: `起：${formatFull(startDate)}，请选择结束日期`, variant: 'selecting' as const }
    return { text: `${formatFull(startDate)} — ${formatFull(endDate)}`, variant: 'done' as const }
  }, [startDate, endDate])

  // ── 浮动面板（Portal 渲染到 document.body，fixed 定位）──────────────────

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="日期范围选择面板"
      style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH, zIndex: 9999 }}
      className={cn(
        'rounded-xl border border-border/60',
        'bg-card/96 backdrop-blur-xl',
        'shadow-xl shadow-black/12',
        'animate-scale-in',
      )}
    >
      {/* 面板标题栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-border/30">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          日期范围筛选
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="关闭"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* 快速预设 */}
        {onQuickSelect && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">快速选择</span>
            </div>
            <div className="flex gap-1.5">
              {QUICK_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleQuickSelect(key)}
                  className="flex-1 h-7 rounded-lg text-xs font-medium border border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-primary active:scale-95 transition-all duration-150 cursor-pointer focus:outline-none"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 分割线 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-[10px] text-muted-foreground/40 font-medium tracking-wide">自定义范围</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        {/* 自定义日历 */}
        <CalendarGrid
          startDate={startDate}
          endDate={endDate}
          currentMonth={currentMonth}
          onDayClick={handleDayClick}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />

        {/* 状态栏 */}
        <div className={cn(
          'px-3 py-1.5 rounded-lg text-xs text-center leading-relaxed',
          statusInfo.variant === 'done' && 'bg-primary/8 border border-primary/20 text-primary font-medium',
          statusInfo.variant === 'selecting' && 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-700/30 text-amber-700 dark:text-amber-400',
          statusInfo.variant === 'hint' && 'bg-muted/30 text-muted-foreground/70',
        )}>
          {statusInfo.text}
        </div>
      </div>

      {/* 底部清除 */}
      {hasAnyDate && (
        <div className="px-3 pb-3 pt-1 flex justify-end border-t border-border/20">
          <button
            type="button"
            onClick={() => { onClear?.(); setSelecting('start'); setOpen(false) }}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs text-muted-foreground border border-border/40 hover:border-destructive/50 hover:text-destructive hover:bg-destructive/6 transition-all duration-150 cursor-pointer focus:outline-none"
          >
            <X className="w-3 h-3" />
            清除日期
          </button>
        </div>
      )}
    </div>
  ) : null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn('relative', className)}>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="日期范围选择器"
        className={cn(
          'flex items-center gap-2 h-9 px-3 rounded-lg',
          'border border-border bg-card text-sm',
          'transition-all duration-200 cursor-pointer',
          'hover:border-primary/60 hover:bg-card/90',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          open && 'border-primary/70 ring-2 ring-ring/30 bg-card/90',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Calendar className={cn('w-4 h-4 shrink-0', hasAnyDate ? 'text-primary' : 'text-muted-foreground')} />

        {hasAnyDate ? (
          <span className="flex items-center gap-1 font-medium text-foreground">
            <span className="tabular-nums text-sm">
              {startDate ? formatShort(startDate) : <span className="text-muted-foreground">—</span>}
            </span>
            <span className="text-muted-foreground text-xs">→</span>
            <span className="tabular-nums text-sm">
              {endDate
                ? formatShort(endDate)
                : <span className="text-muted-foreground/50 text-xs animate-pulse">…</span>
              }
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{placeholder}</span>
        )}

        {hasAnyDate ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="清除日期范围"
            onClick={(e) => { e.stopPropagation(); onClear?.(); setOpen(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClear?.(); setOpen(false) } }}
            className="ml-0.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ml-0.5',
            open && 'rotate-180'
          )} />
        )}
      </button>

      {/* 面板通过 Portal 挂载到 document.body，避免任何 overflow 裁切 */}
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  )
}
