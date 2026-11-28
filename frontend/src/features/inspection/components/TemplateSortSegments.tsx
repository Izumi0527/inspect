import React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export type TemplateSortField = 'name' | 'category' | 'updatedAt'
export type TemplateSortOrder = 'asc' | 'desc'

interface SortOption {
  field: TemplateSortField
  label: string
}

const SORT_OPTIONS: SortOption[] = [
  { field: 'name', label: '模板名称' },
  { field: 'category', label: '类别' },
  { field: 'updatedAt', label: '更新时间' },
]

export interface TemplateSortSegmentsProps {
  sortField: TemplateSortField
  sortOrder: TemplateSortOrder
  onSort: (field: TemplateSortField) => void
}

export const TemplateSortSegments: React.FC<TemplateSortSegmentsProps> = ({
  sortField,
  sortOrder,
  onSort,
}) => {
  return (
    <div
      role="group"
      aria-label="模板排序方式"
      className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface-2 p-[3px]"
    >
      {SORT_OPTIONS.map((option) => {
        const isActive = sortField === option.field
        return (
          <button
            key={option.field}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSort(option.field)}
            className={cn(
              'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              isActive
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{option.label}</span>
            {isActive ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-70" />
            )}
          </button>
        )
      })}
    </div>
  )
}
