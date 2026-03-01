import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import type { Alert } from '../../types'

interface RealTimeAlertsCardProps {
  alerts: Alert[]
  maxItems?: number
  className?: string
}

// 严重程度配置：badge 样式 + 标签
const severityConfig = {
  critical: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
    label: '严重',
  },
  warning: {
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300',
    label: '警告',
  },
  info: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
    label: '信息',
  },
}

export function RealTimeAlertsCard({
  alerts,
  maxItems = 5,
  className,
}: RealTimeAlertsCardProps) {
  const displayAlerts = alerts.slice(0, maxItems)
  const criticalCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.15 }}
      className={className}
    >
      <div className="flex h-full flex-col rounded-xl border border-border/50 bg-card/80 p-5 shadow-lg backdrop-blur-lg dark:border-border dark:bg-card/80">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">实时告警</h3>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/60 dark:text-red-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                {criticalCount} 严重
              </span>
            )}
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground dark:bg-muted/80 dark:text-foreground/90">
              共 {alerts.length} 条
            </span>
          </div>
        </div>

        {displayAlerts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">暂无告警</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayAlerts.map((alert, index) => {
              const config = severityConfig[alert.severity]
              return (
                <motion.div
                  key={alert.id || index}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  className="group flex cursor-pointer items-start gap-3 rounded-lg bg-muted/40 p-3 transition-colors duration-150 hover:bg-muted/60 dark:bg-card/60 dark:hover:bg-card/80"
                >
                  {/* 严重程度 badge */}
                  <span className={cn(
                    'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight',
                    config.badge
                  )}>
                    {config.label}
                  </span>

                  {/* 告警内容 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {alert.deviceName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {alert.message}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
                        {alert.time}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {alerts.length > maxItems && (
          <div className="mt-3 border-t border-border/60 pt-3 text-center dark:border-border">
            <button className="cursor-pointer text-sm font-medium text-primary transition-colors duration-150 hover:text-primary/80">
              查看全部 {alerts.length} 条告警 →
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
