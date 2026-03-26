import { motion } from 'framer-motion'
import { DeviceStatusPieChart } from '../charts'
import type { DeviceStatusDistribution } from '../../types'

interface DeviceStatusCardProps {
  data: DeviceStatusDistribution
  className?: string
}

/**
 * 设备状态分布卡片
 *
 * 包装 DeviceStatusPieChart,添加卡片容器和标题
 */
export function DeviceStatusCard({ data, className }: DeviceStatusCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 }}
      className={className}
    >
      <div className="flex h-full flex-col rounded-xl border border-border/50 bg-card/80 p-5 shadow-lg backdrop-blur-lg hover:bg-card/95 hover:border-border/80 transition-colors duration-150">
        <h3 className="mb-3 text-lg font-semibold text-foreground">
          设备状态分布
        </h3>
        <div className="flex flex-1 flex-col">
          <DeviceStatusPieChart data={data} height={200} showLegend={true} />
        </div>
      </div>
    </motion.div>
  )
}
