import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import type { AvailabilityData } from '../../types'

interface AvailabilityGaugeChartProps {
  data: AvailabilityData
  size?: number
  strokeWidth?: number
  className?: string
}

// 评级阈值配置
const RATING_LEVELS = [
  { min: 90, label: '优秀', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500/15 ring-emerald-500/30', light: '#10B981', dark: '#34D399' },
  { min: 80, label: '警告', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-500/15 ring-amber-500/30', light: '#F59E0B', dark: '#FBBF24' },
  { min: 0,  label: '严重', colorClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-500/15 ring-red-500/30', light: '#EF4444', dark: '#F87171' },
] as const

function getRating(value: number) {
  return RATING_LEVELS.find(l => value >= l.min) ?? RATING_LEVELS[2]
}

const TREND_MAP = {
  up:     { Icon: TrendingUp,   colorClass: 'text-emerald-600 dark:text-emerald-400', label: '上升趋势' },
  down:   { Icon: TrendingDown, colorClass: 'text-red-600 dark:text-red-400',         label: '下降趋势' },
  stable: { Icon: Minus,        colorClass: 'text-muted-foreground',                  label: '趋势稳定' },
} as const

/**
 * 整体可用性环形仪表盘
 *
 * 以半圆弧形式展示系统可用性，搭配目标值对比和趋势指示
 */
export function AvailabilityGaugeChart({
  data,
  size = 160,
  strokeWidth = 14,
  className,
}: AvailabilityGaugeChartProps) {
  const rating = useMemo(() => getRating(data.current), [data.current])
  const trend = TREND_MAP[data.trend]

  // 与目标值的差值
  const diff = data.current - data.target
  const diffLabel = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`
  const hitTarget = diff >= 0

  // 环形参数
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const progress = Math.min(Math.max(data.current / 100, 0), 1)
  const dashOffset = circumference * (1 - progress)

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-5">

        {/* ── 环形仪表盘 ── */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="-rotate-90" width={size} height={size}>
            {/* 背景轨道 — 用 CSS 变量适配深浅色 */}
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              className="stroke-muted-foreground/15"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* 进度弧 — 带渐变光晕 */}
            <motion.circle
              cx={size / 2} cy={size / 2} r={radius}
              className={rating.colorClass}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              strokeLinecap="round"
            />
          </svg>

          {/* 中心内容 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className={`text-3xl font-bold tabular-nums leading-none ${rating.colorClass}`}>
                {data.current.toFixed(1)}
              </span>
              <span className={`text-lg font-semibold ${rating.colorClass}`}>%</span>
              {/* 评级徽章 */}
              <div className="mt-1.5 flex justify-center">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${rating.bgClass} ${rating.colorClass}`}>
                  {rating.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 指标明细 ── */}
        <div className="w-full space-y-1.5">
          {/* 目标值对比 */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/30 dark:bg-muted/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              <span>目标 {data.target}%</span>
            </div>
            <span className={`text-xs font-semibold tabular-nums ${hitTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {diffLabel}
            </span>
          </div>

          {/* 趋势 */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/30 dark:bg-muted/50">
            <span className="text-xs text-muted-foreground">趋势</span>
            <div className={`flex items-center gap-1 ${trend.colorClass}`}>
              <trend.Icon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{trend.label}</span>
            </div>
          </div>
        </div>

        {/* 更新时间 */}
        {data.lastUpdate && (
          <p className="text-[10px] text-muted-foreground/70">
            更新于{' '}
            {new Date(data.lastUpdate).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  )
}
