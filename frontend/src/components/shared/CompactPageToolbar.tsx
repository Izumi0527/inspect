'use client'

import React from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

export interface CompactPageToolbarAction {
  key: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'default' | 'primary' | 'outline' | 'secondary' | 'ghost' | 'destructive'
}

export interface CompactPageToolbarSearch {
  value: string
  placeholder: string
  ariaLabel: string
  onChange: (value: string) => void
  onSubmit?: () => void
}

export interface CompactPageToolbarProps {
  search?: CompactPageToolbarSearch
  filters?: React.ReactNode
  primaryActions?: CompactPageToolbarAction[]
  secondaryActions?: CompactPageToolbarAction[]
  customActions?: React.ReactNode
  layout?: 'start' | 'end' | 'between'
  bordered?: boolean
  className?: string
  testIdPrefix?: string
}

export const CompactPageToolbar: React.FC<CompactPageToolbarProps> = ({
  search,
  filters,
  primaryActions = [],
  secondaryActions = [],
  customActions,
  layout = 'end',
  bordered = false,
  className,
  testIdPrefix = 'compact-page-toolbar',
}) => {
  const hasSearch = Boolean(search)
  const hasFilters = Boolean(filters)
  const hasActions =
    primaryActions.length > 0 ||
    secondaryActions.length > 0 ||
    Boolean(customActions)

  if (!hasSearch && !hasFilters && !hasActions) return null

  const isStartLayout = layout === 'start'
  const isEndLayout = layout === 'end'

  const searchNode = search ? (
    <div
      className={cn(
        'relative w-full',
        isStartLayout || isEndLayout ? 'sm:w-80' : 'sm:w-64'
      )}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
      <Input
        aria-label={search.ariaLabel}
        placeholder={search.placeholder}
        value={search.value}
        onChange={(event) => search.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          search.onSubmit?.()
        }}
        className="h-9 pl-10 text-sm"
      />
    </div>
  ) : null

  const actionsNode = hasActions ? (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        isStartLayout ? 'justify-start' : 'justify-end'
      )}
    >
      {secondaryActions.map((action) => (
        <Button
          key={action.key}
          type="button"
          variant={action.variant ?? 'outline'}
          disabled={action.disabled}
          loading={action.loading}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
      {customActions}
      {primaryActions.map((action) => (
        <Button
          key={action.key}
          type="button"
          variant={action.variant ?? 'default'}
          disabled={action.disabled}
          loading={action.loading}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  ) : null

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-1 sm:flex-row sm:items-center',
        bordered && 'border-b border-border px-4 py-3',
        isStartLayout
          ? 'sm:justify-start'
          : isEndLayout
            ? 'sm:justify-end'
            : 'sm:justify-between',
        className
      )}
    >
      {isStartLayout ? (
        <div
          data-testid={`${testIdPrefix}-start-group`}
          className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-start"
        >
          {searchNode}
          {filters ? <div>{filters}</div> : null}
          {actionsNode}
        </div>
      ) : isEndLayout ? (
        <div
          data-testid={`${testIdPrefix}-end-group`}
          className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end"
        >
          {searchNode}
          {filters ? <div>{filters}</div> : null}
          {actionsNode}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {searchNode}
            {filters ? <div>{filters}</div> : null}
          </div>
          {actionsNode}
        </>
      )}
    </div>
  )
}
