'use client'

import React from 'react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/atoms'
import { useSkin } from '@/lib/contexts/skin-context'
import { cn } from '@/utils/cn'

/**
 * 经典皮肤沿用旧配方：按图标着色推导彩色底衬（仪器皮肤不给底衬）。
 */
const deriveIconBgClassName = (iconClassName?: string) => {
  const value = iconClassName ?? ''
  if (value.includes('text-blue') || value.includes('text-sky')) return 'bg-sky-100/80 dark:bg-sky-500/12'
  if (value.includes('text-green') || value.includes('text-emerald')) return 'bg-emerald-100/80 dark:bg-emerald-500/12'
  if (value.includes('text-red')) return 'bg-red-100/80 dark:bg-red-500/12'
  if (value.includes('text-yellow') || value.includes('text-amber')) return 'bg-amber-100/80 dark:bg-amber-500/12'
  if (value.includes('text-purple') || value.includes('text-slate')) return 'bg-slate-200/80 dark:bg-slate-400/12'
  if (value.includes('text-orange')) return 'bg-orange-100/80 dark:bg-orange-500/12'
  if (value.includes('text-cyan')) return 'bg-cyan-100/80 dark:bg-cyan-500/12'
  return 'bg-muted/60'
}

export interface CompactStatCardProps {
  title: string
  value: React.ReactNode
  change?: string
  changeHint?: string
  /** 数值方向：决定箭头朝向（↗ 上升 / ↘ 下降 / → 持平） */
  trend?: 'up' | 'down' | 'stable'
  /**
   * 变化的好坏：决定涨跌文字的配色。
   *
   * 默认由 trend 推导（上升=正面），适用于「越高越好」的指标。
   * 对故障率、错误数这类「越低越好」的指标显式传 'negative'，
   * 即可做到「箭头照实反映数值上升，颜色照实反映这是坏消息」，
   * 避免出现箭头向下却配正数这类自相矛盾的呈现。
   */
  sentiment?: 'positive' | 'negative' | 'neutral'
  icon: LucideIcon
  /** 图标着色（默认中性 ink-2；仅异常读数才建议传状态色） */
  iconClassName?: string
  /** 兼容旧调用方：如显式传入则为图标提供一个底衬容器 */
  iconBgClassName?: string
  valueClassName?: string
  className?: string
  onClick?: () => void
  ariaLabel?: string
}

const deriveAriaLabel = (title: string, value: React.ReactNode) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return `${title}：${value}`
  }
  return title
}

/**
 * 旧调用方会传入 Tailwind 调色板类（text-blue-600 等）作为图标/读数着色。
 * 精密仪器的彩色预算只有 6 个语义色，故在该皮肤下剥离这些调色板类
 * （语义令牌如 text-danger / text-warning 保留，它们表示真实状态）。
 */
const LEGACY_PALETTE_COLOR =
  /^(?:dark:)?(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?$/

const neutralizeLegacyPalette = (className?: string): string | undefined => {
  if (!className) return undefined
  const kept = className.split(/\s+/).filter((cls) => cls && !LEGACY_PALETTE_COLOR.test(cls))
  return kept.length > 0 ? kept.join(' ') : undefined
}

/**
 * 统计读数卡（精密仪器）。
 *
 * 读数是主角：24px semibold + tabular-nums；标题 12px ink-2；图标退为 16px 中性点缀。
 * 读数默认中性——只有异常值才通过 valueClassName 获得状态强调；
 * 卡片本身不再携带彩色图标底（色彩预算：全屏只有 6 个彩色值）。
 */
export const CompactStatCard: React.FC<CompactStatCardProps> = ({
  title,
  value,
  change,
  changeHint,
  trend = 'stable',
  sentiment,
  icon: Icon,
  iconClassName,
  iconBgClassName,
  valueClassName,
  className,
  onClick,
  ariaLabel,
}) => {
  const { skin } = useSkin()
  const isInstrument = skin === 'instrument'
  const resolvedIconClassName = isInstrument
    ? neutralizeLegacyPalette(iconClassName) ?? 'text-muted-foreground/80'
    : iconClassName ?? 'text-sky-600 dark:text-sky-300'
  const resolvedValueClassName = isInstrument ? neutralizeLegacyPalette(valueClassName) : valueClassName
  const resolvedIconBgClassName =
    iconBgClassName ?? (isInstrument ? undefined : deriveIconBgClassName(resolvedIconClassName))
  // 箭头只表达数值方向，配色单独由 sentiment 决定
  const trendArrow = {
    up: '↗',
    down: '↘',
    stable: '→',
  } as const

  const sentimentClassName = {
    positive: 'text-success',
    negative: 'text-destructive',
    neutral: 'text-muted-foreground',
  } as const

  // 未显式指定 sentiment 时沿用原有约定（上升=正面），保持既有调用方行为不变
  const resolvedSentiment =
    sentiment ?? (trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : 'neutral')

  const trendConfig = {
    up: { icon: trendArrow.up, className: sentimentClassName[resolvedSentiment] },
    down: { icon: trendArrow.down, className: sentimentClassName[resolvedSentiment] },
    stable: { icon: trendArrow.stable, className: sentimentClassName[resolvedSentiment] },
  } as const

  const iconNode = resolvedIconBgClassName ? (
    <span data-slot="stat-icon-chip" className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-sm', resolvedIconBgClassName)}>
      <Icon className={cn('h-4 w-4', resolvedIconClassName)} />
    </span>
  ) : (
    <Icon className={cn('h-4 w-4 shrink-0', resolvedIconClassName)} />
  )

  const card = (
    <Card
      data-slot="stat-card"
      className={cn(
        onClick && 'cursor-pointer transition-colors duration-100 hover:bg-surface-3',
        className
      )}
    >
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground leading-tight truncate">
              {title}
            </p>
            <p
              data-slot="stat-value"
              className={cn(
                'mt-1.5 text-2xl font-semibold leading-none tabular-nums text-foreground',
                resolvedValueClassName
              )}
            >
              {value}
            </p>
            {change && (
              <p
                className={cn(
                  'mt-1 text-xs font-medium',
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
          <span className="mt-0.5">{iconNode}</span>
        </div>
      </CardContent>
    </Card>
  )

  if (!onClick) return card

  return (
    <button
      type="button"
      className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={onClick}
      aria-label={ariaLabel ?? deriveAriaLabel(title, value)}
    >
      {card}
    </button>
  )
}
