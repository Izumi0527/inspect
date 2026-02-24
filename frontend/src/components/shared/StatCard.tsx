import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { cn } from '@/utils/cn'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'stable'
  icon: LucideIcon
  iconColor?: string
  className?: string
  index?: number
}

// 从 iconColor class 推导出对应的背景色和边框色
const colorAccentMap: Record<string, { bg: string; border: string }> = {
  'text-blue-600': { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-l-blue-500' },
  'text-green-600': { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-l-green-500' },
  'text-red-600': { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-l-red-500' },
  'text-purple-600': { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-l-purple-500' },
  'text-orange-600': { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-l-orange-500' },
  'text-cyan-600': { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-l-cyan-500' },
}

export const StatCard = memo(function StatCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  iconColor = 'text-blue-600',
  className,
  index = 0,
}: StatCardProps) {
  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    stable: 'text-gray-600 dark:text-gray-400',
  }

  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→',
  }

  const accent = useMemo(
    () => colorAccentMap[iconColor] ?? { bg: 'bg-gray-50 dark:bg-gray-800/40', border: 'border-l-gray-400' },
    [iconColor]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={cn(className)}
    >
      <Card className={cn(
        'border-l-[3px] transition-shadow duration-200 hover:shadow-lg',
        accent.border
      )}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {title}
              </p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                {value}
              </p>
              {change && (
                <p className={cn(
                  'mt-1.5 text-xs font-semibold',
                  trend && trendColors[trend]
                )}>
                  {trend && trendIcons[trend]} {change}
                </p>
              )}
            </div>
            <div className={cn('flex-shrink-0 rounded-xl p-2.5', accent.bg)}>
              <Icon className={cn('h-6 w-6', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})
