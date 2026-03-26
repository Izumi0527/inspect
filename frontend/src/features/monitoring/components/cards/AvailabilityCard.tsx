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
 * 直接包装 AvailabilityGaugeChart，提供卡片容器和标题
 */
export function AvailabilityCard({ data, className }: AvailabilityCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
      className={className}
    >
      <div className="flex h-full flex-col rounded-xl border border-border/50 bg-card/80 p-5 shadow-lg backdrop-blur-lg hover:bg-card/95 hover:border-border/80 transition-colors duration-150">
        <h3 className="mb-3 text-lg font-semibold text-foreground">
          整体可用性
        </h3>
        <div className="flex flex-1 items-center justify-center">
          <AvailabilityGaugeChart data={data} size={150} strokeWidth={14} />
        </div>
      </div>
    </motion.div>
  )
}
