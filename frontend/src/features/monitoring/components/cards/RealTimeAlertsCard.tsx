import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import type { Alert } from '../../types'

interface RealTimeAlertsCardProps {
  alerts: Alert[]
  maxItems?: number
  className?: string
}

/**
 * 实时告警卡片
 *
 * 显示最新的告警列表
 * - 严重程度颜色点(红/黄/蓝)
 * - 设备名称
 * - 告警消息
 * - 相对时间
 */
export function RealTimeAlertsCard({
  alerts,
  maxItems = 5,
  className,
}: RealTimeAlertsCardProps) {
  // 严重程度颜色映射
  const severityColors = {
    critical: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  }

  // 严重程度文字颜色
  const _severityTextColors = {
    critical: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400',
  }

  const displayAlerts = alerts.slice(0, maxItems)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className={className}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">实时告警</h3>
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-100">
            {alerts.length} 条
          </span>
        </div>

        {displayAlerts.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">暂无告警</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayAlerts.map((alert, index) => (
              <motion.div
                key={alert.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="group flex items-start gap-3 rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                {/* 严重程度指示器 */}
                <div className="flex-shrink-0 pt-1">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      severityColors[alert.severity]
                    )}
                  />
                </div>

                {/* 告警内容 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {alert.deviceName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                        {alert.message}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {alert.time}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 查看更多 */}
        {alerts.length > maxItems && (
          <div className="mt-4 text-center">
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              查看全部 {alerts.length} 条告警 →
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
