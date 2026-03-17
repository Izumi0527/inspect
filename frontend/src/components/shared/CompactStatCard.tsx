import React from 'react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/atoms'
import { cn } from '@/utils/cn'

export interface CompactStatCardProps {
  title: string
  value: React.ReactNode
  change?: string
  changeHint?: string
  trend?: 'up' | 'down' | 'stable'
  icon: LucideIcon
  iconClassName?: string
  iconBgClassName?: string
  valueClassName?: string
  className?: string
  onClick?: () => void
  ariaLabel?: string
}

const deriveIconBgClassName = (iconClassName?: string) => {
  const value = iconClassName ?? ''

  if (value.includes('text-blue')) return 'bg-blue-100 dark:bg-blue-900/30'
  if (value.includes('text-green')) return 'bg-green-100 dark:bg-green-900/30'
  if (value.includes('text-red')) return 'bg-red-100 dark:bg-red-900/30'
  if (value.includes('text-yellow')) return 'bg-yellow-100 dark:bg-yellow-900/30'
  if (value.includes('text-purple')) return 'bg-purple-100 dark:bg-purple-900/30'
  if (value.includes('text-orange')) return 'bg-orange-100 dark:bg-orange-900/30'
  if (value.includes('text-cyan')) return 'bg-cyan-100 dark:bg-cyan-900/30'
  if (value.includes('text-gray')) return 'bg-muted/60'

  return 'bg-muted/60'
}

const deriveAriaLabel = (title: string, value: React.ReactNode) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return `${title}：${value}`
  }
  return title
}

export const CompactStatCard: React.FC<CompactStatCardProps> = ({
  title,
  value,
  change,
  changeHint,
  trend = 'stable',
  icon: Icon,
  iconClassName = 'text-blue-600 dark:text-blue-400',
  iconBgClassName,
  valueClassName,
  className,
  onClick,
  ariaLabel,
}) => {
  const trendConfig = {
    up: { icon: '↗', className: 'text-green-600 dark:text-green-400' },
    down: { icon: '↘', className: 'text-red-600 dark:text-red-400' },
    stable: { icon: '→', className: 'text-muted-foreground' },
  } as const

  const card = (
    <Card
      className={cn(
        onClick && 'cursor-pointer hover:bg-muted/30 transition-colors',
        className
      )}
    >
      <CardContent className="p-2.5">
        <div className="flex items-center">
          <div
            className={cn(
              'p-1 rounded-md',
              iconBgClassName ?? deriveIconBgClassName(iconClassName)
            )}
          >
            <Icon className={cn('h-5 w-5', iconClassName)} />
          </div>
          <div className="ml-2.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground leading-tight truncate">
              {title}
            </p>
            <p
              className={cn(
                'text-lg font-bold text-foreground leading-none',
                valueClassName
              )}
            >
              {value}
            </p>
            {change && (
              <p
                className={cn(
                  'mt-1 text-xs font-semibold',
                  trendConfig[trend].className
                )}
              >
                {trendConfig[trend].icon} {change}
                {changeHint && (
                  <>
                    {' '}
                    <span className="font-medium text-muted-foreground">
                      {changeHint}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (!onClick) return card

  return (
    <button
      type="button"
      className="block w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      onClick={onClick}
      aria-label={ariaLabel ?? deriveAriaLabel(title, value)}
    >
      {card}
    </button>
  )
}
