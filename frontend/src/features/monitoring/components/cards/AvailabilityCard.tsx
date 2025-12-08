import { motion } from 'framer-motion'
import { AvailabilityGaugeChart } from '../charts'
import type { AvailabilityData } from '../../types'

interface AvailabilityCardProps {
  data: AvailabilityData
  className?: string
}

/**
 * 整体可用性卡片
 *
 * 包装 AvailabilityGaugeChart,添加卡片容器和标题
 */
export function AvailabilityCard({ data, className }: AvailabilityCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={className}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          整体可用性
        </h3>
        <AvailabilityGaugeChart data={data} size={140} />
      </div>
    </motion.div>
  )
}
