import React from 'react'
import { cn } from '@/utils/cn'

export type StrategyTypeFilter = 'all' | 'manual' | 'scheduled'
export type StrategyEnabledFilter = 'all' | 'enabled' | 'disabled'

interface SegmentOption<T extends string> {
  value: T
  label: string
}

const TYPE_OPTIONS: SegmentOption<StrategyTypeFilter>[] = [
  { value: 'all', label: '全部类型' },
  { value: 'manual', label: '仅手动' },
  { value: 'scheduled', label: '仅定时' },
]

const STATUS_OPTIONS: SegmentOption<StrategyEnabledFilter>[] = [
  { value: 'all', label: '全部状态' },
  { value: 'enabled', label: '仅启用' },
  { value: 'disabled', label: '仅禁用' },
]

interface SegmentGroupProps<T extends string> {
  ariaLabel: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
}

function SegmentGroup<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-lg border border-border/70 bg-surface-2 p-1"
    >
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              isActive
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export interface StrategyFilterSegmentsProps {
  typeFilter: StrategyTypeFilter
  enabledFilter: StrategyEnabledFilter
  onTypeChange: (next: StrategyTypeFilter) => void
  onEnabledChange: (next: StrategyEnabledFilter) => void
}

export const StrategyFilterSegments: React.FC<StrategyFilterSegmentsProps> = ({
  typeFilter,
  enabledFilter,
  onTypeChange,
  onEnabledChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentGroup
        ariaLabel="按触发类型筛选"
        value={typeFilter}
        options={TYPE_OPTIONS}
        onChange={onTypeChange}
      />
      <SegmentGroup
        ariaLabel="按启用状态筛选"
        value={enabledFilter}
        options={STATUS_OPTIONS}
        onChange={onEnabledChange}
      />
    </div>
  )
}
