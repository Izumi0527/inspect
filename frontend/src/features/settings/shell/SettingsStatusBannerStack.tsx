'use client'

import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import type { SettingsBannerDescriptor } from '@/features/settings/types/shell.types'

interface SettingsStatusBannerStackProps {
  banners: SettingsBannerDescriptor[]
  className?: string
}

const toneConfig = {
  info: {
    Icon: Info,
    className:
      'border-sky-200/80 bg-sky-50/80 text-sky-900 dark:border-sky-400/20 dark:bg-card/92 dark:text-sky-100',
    iconClassName: 'text-sky-600 dark:text-sky-300',
  },
  success: {
    Icon: CheckCircle,
    className:
      'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/20 dark:bg-card/92 dark:text-emerald-100',
    iconClassName: 'text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    Icon: AlertTriangle,
    className:
      'border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-400/20 dark:bg-card/92 dark:text-amber-100',
    iconClassName: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    Icon: AlertCircle,
    className:
      'border-red-200/80 bg-red-50/80 text-red-900 dark:border-red-400/20 dark:bg-card/92 dark:text-red-100',
    iconClassName: 'text-red-600 dark:text-red-300',
  },
} as const

export const SettingsStatusBannerStack: React.FC<SettingsStatusBannerStackProps> = ({
  banners,
  className,
}) => {
  if (!banners.length) return null

  return (
    <div className={cn('px-4 pt-3 space-y-2', className)}>
      {banners.map((banner) => {
        const config = toneConfig[banner.tone]
        const Icon = config.Icon

        return (
          <div
            key={banner.key}
            className={cn(
              'rounded-lg border px-4 py-3 flex items-start gap-3',
              config.className
            )}
          >
            <Icon className={cn('w-5 h-5 mt-0.5', config.iconClassName)} />
            <div className="flex-1 min-w-0">
              {banner.title ? (
                <div className="text-sm font-semibold leading-tight">
                  {banner.title}
                </div>
              ) : null}
              <div className="text-sm text-muted-foreground dark:text-muted-foreground">
                {banner.description}
              </div>
            </div>
            {banner.action ? (
              <Button
                type="button"
                variant={banner.action.variant ?? 'outline'}
                disabled={banner.action.disabled}
                loading={banner.action.loading}
                onClick={banner.action.onClick}
              >
                {banner.action.icon}
                {banner.action.label}
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

