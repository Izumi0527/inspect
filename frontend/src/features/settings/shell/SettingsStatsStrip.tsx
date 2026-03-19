'use client'

import React from 'react'
import { CompactStatCard } from '@/components/shared'
import { cn } from '@/utils/cn'
import type { SettingsStatCardDescriptor } from '@/features/settings/types/shell.types'

interface SettingsStatsStripProps {
  stats: SettingsStatCardDescriptor[]
  className?: string
}

export const SettingsStatsStrip: React.FC<SettingsStatsStripProps> = ({
  stats,
  className,
}) => {
  if (!stats.length) return null

  return (
    <div className={cn('px-4 py-3 flex flex-wrap gap-3', className)}>
      {stats.map((stat) => (
        <CompactStatCard
          key={stat.key}
          className="min-w-[120px]"
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          iconClassName={stat.iconClassName}
          valueClassName={stat.valueClassName}
        />
      ))}
    </div>
  )
}

