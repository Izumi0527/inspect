import { memo } from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/atoms'
import { cn } from '@/utils/cn'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'stable'
  icon: LucideIcon // 必需参数
  iconColor?: string
  className?: string
  index?: number // 用于动画延迟
}

/**
 * 统一的统计卡片组件
 *
 * @features
 * - Framer Motion 入场动画
 * - Lucide Icons 图标支持
 * - 趋势指示器(up/down/stable)
 * - 统一样式(text-3xl 数值, p-6 内边距, hover:shadow-lg)
 * - React.memo 性能优化
 *
 * @example
 * <StatCard
 *   title="设备总数"
 *   value={120}
 *   change="+12.5%"
 *   trend="up"
 *   icon={Server}
 *   iconColor="text-blue-600"
 *   index={0}
 * />
 */
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
  // 趋势样式映射
  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    stable: 'text-gray-600 dark:text-gray-400',
  }

  // 趋势图标映射
  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(className)}
    >
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {/* 左侧: 标题、数值、变化量 */}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                {title}
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {value}
              </p>
              {change && (
                <p
                  className={cn(
                    'text-sm font-medium mt-2',
                    trend && trendColors[trend]
                  )}
                >
                  {trend && trendIcons[trend]} {change}
                </p>
              )}
            </div>

            {/* 右侧: 图标 */}
            <div className="p-3 bg-gray-50 dark:bg-accent/10 rounded-full">
              <Icon className={cn('w-8 h-8', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})
