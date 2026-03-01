import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChartContainer } from '@/components/atoms/charts'
import type { AvailabilityData } from '../../types'

interface AvailabilityGaugeChartProps {
  data: AvailabilityData
  size?: number
  strokeWidth?: number
  className?: string
}

/**
 * 整体可用性环形进度条
 *
 * 以环形进度条形式展示系统可用性
 * - 90-100%: 绿色 (优秀)
 * - 80-90%: 黄色 (警告)
 * - <80%: 红色 (严重)
 */
export function AvailabilityGaugeChart({
  data,
  size = 160,
  strokeWidth = 12,
  className,
}: AvailabilityGaugeChartProps) {
  // 计算颜色 - 更鲜艳的配色
  const gaugeColor = useMemo(() => {
    if (data.current >= 90) return '#22C55E' // 鲜绿色
    if (data.current >= 80) return '#F59E0B' // 橙色
    return '#EF4444' // 红色
  }, [data.current])

  // 计算与目标的差值
  const diffFromTarget = useMemo(() => {
    const diff = data.current - data.target
    const sign = diff >= 0 ? '+' : ''
    return `${sign}${diff.toFixed(2)}%`
  }, [data.current, data.target])

  // 趋势图标和颜色
  const trendConfig = useMemo(() => {
    switch (data.trend) {
      case 'up':
        return { icon: '↑', color: 'text-green-600', label: '上升' }
      case 'down':
        return { icon: '↓', color: 'text-red-600', label: '下降' }
      case 'stable':
        return { icon: '→', color: 'text-muted-foreground', label: '稳定' }
    }
  }, [data.trend])

  // 环形进度条参数
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = `${circumference} ${circumference}`
  const strokeDashoffset = circumference - (data.current / 100) * circumference

  // 根据 size 动态计算字体大小
  const fontSize = size <= 120 ? 'text-2xl' : 'text-4xl'
  const subTextSize = size <= 120 ? 'text-[10px]' : 'text-xs'

  // 深色模式检测
  const isDark =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const bgColor = isDark ? '#374151' : '#E5E7EB'

  return (
    <ChartContainer className={className}>
      <div className="flex flex-col items-center justify-center">
        {/* 环形进度条 */}
        <div className="relative mb-4">
          <svg className="-rotate-90 transform" width={size} height={size}>
            {/* 背景圆环 */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={bgColor}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* 进度圆环 */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={gaugeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={strokeDasharray}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: 'easeInOut' }}
              strokeLinecap="round"
            />
          </svg>
          {/* 中心文字 - 调整内边距避免与圆环重叠 */}
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ padding: strokeWidth + 4 }}
          >
            <div className="text-center">
              <div
                className={`${fontSize} font-bold leading-tight`}
                style={{ color: gaugeColor }}
              >
                {data.current.toFixed(2)}%
              </div>
              <div className={`mt-0.5 ${subTextSize} text-muted-foreground`}>可用性</div>
            </div>
          </div>
        </div>

        {/* 详细信息 */}
        <div className="w-full space-y-2">
          {/* 目标对比 */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 dark:bg-muted/80">
            <span className="text-sm text-muted-foreground">目标值</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {data.target}%
              </span>
              <span
                className={`text-sm font-medium ${data.current >= data.target ? 'text-green-600' : 'text-red-600'}`}
              >
                ({diffFromTarget})
              </span>
            </div>
          </div>

          {/* 趋势 */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 dark:bg-muted/80">
            <span className="text-sm text-muted-foreground">趋势</span>
            <div className="flex items-center gap-2">
              <span className={`text-xl ${trendConfig.color}`}>{trendConfig.icon}</span>
              <span className={`text-sm font-medium ${trendConfig.color}`}>
                {trendConfig.label}
              </span>
            </div>
          </div>

          {/* 最后更新时间 */}
          {data.lastUpdate && (
            <div className="mt-4 text-center text-xs text-muted-foreground">
              更新于:{' '}
              {new Date(data.lastUpdate).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>

        {/* 评级标识 */}
        <div className="mt-6 flex gap-2 text-xs">
          <div
            className={`rounded px-2 py-1 ${data.current >= 90 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-muted/60 text-muted-foreground dark:bg-card/80 dark:text-muted-foreground'}`}
          >
            优秀 (≥90%)
          </div>
          <div
            className={`rounded px-2 py-1 ${data.current >= 80 && data.current < 90 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' : 'bg-muted/60 text-muted-foreground dark:bg-card/80 dark:text-muted-foreground'}`}
          >
            警告 (80-90%)
          </div>
          <div
            className={`rounded px-2 py-1 ${data.current < 80 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-muted/60 text-muted-foreground dark:bg-card/80 dark:text-muted-foreground'}`}
          >
            严重 (&lt;80%)
          </div>
        </div>
      </div>
    </ChartContainer>
  )
}
