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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={className}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          设备状态分布
        </h3>
        <DeviceStatusPieChart data={data} height={240} showLegend={true} />
      </div>
    </motion.div>
  )
}
