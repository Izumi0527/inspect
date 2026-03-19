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
      'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-100',
    iconClassName: 'text-blue-600 dark:text-blue-300',
  },
  success: {
    Icon: CheckCircle,
    className:
      'border-green-200 bg-green-50 text-green-900 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-100',
    iconClassName: 'text-green-600 dark:text-green-300',
  },
  warning: {
    Icon: AlertTriangle,
    className:
      'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800/60 dark:bg-yellow-900/20 dark:text-yellow-100',
    iconClassName: 'text-yellow-700 dark:text-yellow-300',
  },
  danger: {
    Icon: AlertCircle,
    className:
      'border-red-200 bg-red-50 text-red-900 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-100',
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

