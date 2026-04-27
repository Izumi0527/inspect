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

  if (value.includes('text-blue') || value.includes('text-sky')) {
    return 'bg-sky-100/80 dark:bg-sky-500/12'
  }
  if (value.includes('text-green') || value.includes('text-emerald')) {
    return 'bg-emerald-100/80 dark:bg-emerald-500/12'
  }
  if (value.includes('text-red')) return 'bg-red-100/80 dark:bg-red-500/12'
  if (value.includes('text-yellow') || value.includes('text-amber')) {
    return 'bg-amber-100/80 dark:bg-amber-500/12'
  }
  if (value.includes('text-purple') || value.includes('text-slate')) {
    return 'bg-slate-200/80 dark:bg-slate-400/12'
  }
  if (value.includes('text-orange')) return 'bg-orange-100/80 dark:bg-orange-500/12'
  if (value.includes('text-cyan')) return 'bg-cyan-100/80 dark:bg-cyan-500/12'
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
  iconClassName = 'text-sky-600 dark:text-sky-300',
  iconBgClassName,
  valueClassName,
  className,
  onClick,
  ariaLabel,
}) => {
  const trendConfig = {
    up: { icon: '↗', className: 'text-emerald-600 dark:text-emerald-300' },
    down: { icon: '↘', className: 'text-red-600 dark:text-red-300' },
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
      className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={onClick}
      aria-label={ariaLabel ?? deriveAriaLabel(title, value)}
    >
      {card}
    </button>
  )
}
