import { memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import type { StatCardData } from '../../types'

interface StatCardProps extends StatCardData {
  className?: string
  index?: number
}

/**
 * 统计卡片组件
 *
 * 显示单个统计指标,包含:
 * - 标题
 * - 数值
 * - 变化量(可选)
 * - 趋势指��器(可选)
 *
 * 使用 React.memo 优化性能,避免不必要的重渲染
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  change,
  trend,
  icon: _icon,
  color = 'blue',
  className,
  index = 0,
}: StatCardProps) {
  // 颜色方案映射
  const colorSchemes = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      dot: 'bg-blue-500',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      dot: 'bg-green-500',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      dot: 'bg-purple-500',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400',
      dot: 'bg-orange-500',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      dot: 'bg-red-500',
    },
    cyan: {
      bg: 'bg-cyan-50 dark:bg-cyan-900/20',
      text: 'text-cyan-600 dark:text-cyan-400',
      dot: 'bg-cyan-500',
    },
  }

  // 趋势颜色
  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    stable: 'text-gray-600 dark:text-gray-400',
  }

  // 趋势图标
  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→',
  }

  const scheme = colorSchemes[color as keyof typeof colorSchemes] || colorSchemes.blue

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800',
        className
      )}
    >
      {/* 装饰性背景 */}
      <div className={cn('absolute right-0 top-0 h-24 w-24 -translate-y-6 translate-x-6 rounded-full opacity-10 blur-2xl', scheme.bg)} />

      {/* 卡片头部 */}
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        </div>
        {/* 颜色点指示器 */}
        <div className={cn('h-2 w-2 rounded-full', scheme.dot)} />
      </div>

      {/* 数值显示 */}
      <div className="relative mt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {value}
          </span>
        </div>
      </div>

      {/* 变化量和趋势 */}
      {(change || trend) && (
        <div className="relative mt-2 flex items-center gap-2">
          {change && (
            <span className={cn('text-sm font-medium', trend ? trendColors[trend] : 'text-gray-600 dark:text-gray-400')}>
              {trend && trendIcons[trend]} {change}
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            vs 上期
          </span>
        </div>
      )}

      {/* Hover 效果 */}
      <div className="absolute inset-0 -z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <div className={cn('h-full w-full', scheme.bg)} />
      </div>
    </motion.div>
  )
})
