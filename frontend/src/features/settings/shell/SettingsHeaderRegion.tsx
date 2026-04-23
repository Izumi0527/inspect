'use client'

import React from 'react'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'
import type {
  SettingsPageAction,
  SettingsStatCardDescriptor,
  SettingsToolbarDescriptor,
} from '@/features/settings/types/shell.types'

interface SettingsHeaderRegionProps {
  headerLayout?: 'stacked' | 'inline'
  stats: SettingsStatCardDescriptor[]
  toolbar?: SettingsToolbarDescriptor
  primaryActions?: SettingsPageAction[]
  secondaryActions?: SettingsPageAction[]
}

export const SettingsHeaderRegion: React.FC<SettingsHeaderRegionProps> = ({
  headerLayout = 'stacked',
  stats,
  toolbar,
  primaryActions,
  secondaryActions,
}) => {
  const hasStats = stats.length > 0
  const hasToolbar =
    Boolean(toolbar?.search) ||
    Boolean(toolbar?.filters) ||
    Boolean(toolbar?.primaryActions?.length) ||
    Boolean(toolbar?.secondaryActions?.length) ||
    Boolean(primaryActions?.length) ||
    Boolean(secondaryActions?.length)

  if (headerLayout === 'inline' && hasStats && hasToolbar) {
    return (
      <div
        data-testid="settings-header-inline"
        className="border-b border-border flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <SettingsStatsStrip stats={stats} />
        <SettingsToolbar
          toolbar={toolbar}
          primaryActions={primaryActions}
          secondaryActions={secondaryActions}
          bordered={false}
          className="lg:pl-0"
        />
      </div>
    )
  }

  return (
    <>
      <SettingsStatsStrip stats={stats} />
      <SettingsToolbar
        toolbar={toolbar}
        primaryActions={primaryActions}
        secondaryActions={secondaryActions}
      />
    </>
  )
}
