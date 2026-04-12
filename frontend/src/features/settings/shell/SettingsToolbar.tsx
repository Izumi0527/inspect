'use client'

import React, { useMemo } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import type {
  SettingsPageAction,
  SettingsToolbarDescriptor,
} from '@/features/settings/types/shell.types'

interface SettingsToolbarProps {
  toolbar?: SettingsToolbarDescriptor
  primaryActions?: SettingsPageAction[]
  secondaryActions?: SettingsPageAction[]
  className?: string
}

export const SettingsToolbar: React.FC<SettingsToolbarProps> = ({
  toolbar,
  primaryActions,
  secondaryActions,
  className,
}) => {
  const mergedPrimaryActions = useMemo(
    () => [...(toolbar?.primaryActions ?? []), ...(primaryActions ?? [])],
    [primaryActions, toolbar?.primaryActions]
  )

  const mergedSecondaryActions = useMemo(
    () => [...(toolbar?.secondaryActions ?? []), ...(secondaryActions ?? [])],
    [secondaryActions, toolbar?.secondaryActions]
  )

  const hasSearch = Boolean(toolbar?.search)
  const hasFilters = Boolean(toolbar?.filters)
  const hasActions =
    mergedPrimaryActions.length > 0 || mergedSecondaryActions.length > 0

  if (!hasSearch && !hasFilters && !hasActions) return null

  return (
    <div
      className={cn(
        'px-4 py-3 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {toolbar?.search && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
            <Input
              aria-label={toolbar.search.ariaLabel}
              placeholder={toolbar.search.placeholder}
              value={toolbar.search.value}
              onChange={(event) => toolbar.search?.onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                toolbar.search?.onSubmit?.()
              }}
              className="pl-10 h-9 text-sm"
            />
          </div>
        )}
        {toolbar?.filters ? <div>{toolbar.filters}</div> : null}
      </div>

      {hasActions ? (
        <div className="flex flex-wrap gap-2 justify-end">
          {mergedSecondaryActions.map((action) => (
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
          {mergedPrimaryActions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant={action.variant ?? (action.danger ? 'destructive' : 'default')}
              disabled={action.disabled}
              loading={action.loading}
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

