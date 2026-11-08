'use client'

import { Button } from '@/components/atoms'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MONITORING_SAMPLE_INTERVAL_MINUTES, TIME_RANGE_OPTIONS } from '../../utils/monitoring'

interface MonitoringTimeRangeBarProps {
  /** 当前时间范围档位（与页面状态同源，切换即触发整页重新取数） */
  timeRange: string
  onTimeRangeChange: (value: string) => void
}

/**
 * 监控中心时间范围筛选栏
 *
 * - 快捷时间键：8 档一键切换（1h/3h/6h/12h/24h/3d/7d/14d），当前档位用 aria-pressed 标记
 * - 下拉：与快捷时间键同源同值（供键盘操作与窄屏使用），保证全页只有这一个时间范围入口
 * - 采样间隔提示：后端对每个档位都固定 5 分钟分桶（与采集节奏一致），明示避免把"曲线变密"误读为数据异常
 */
export function MonitoringTimeRangeBar({ timeRange, onTimeRangeChange }: MonitoringTimeRangeBarProps) {
  return (
    <div
      data-slot="monitoring-time-range-bar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
    >
      <div role="group" aria-label="快捷时间范围" className="flex flex-wrap items-center gap-1">
        {TIME_RANGE_OPTIONS.map((item) => {
          const active = item.value === timeRange
          return (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={active ? 'default' : 'ghost'}
              aria-pressed={active}
              onClick={() => onTimeRangeChange(item.value)}
            >
              {item.label}
            </Button>
          )
        })}
      </div>

      <Select value={timeRange} onValueChange={onTimeRangeChange}>
        <SelectTrigger className="h-8 w-28 px-3 py-2 text-sm" aria-label="监控时间范围">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">
        采样间隔 {MONITORING_SAMPLE_INTERVAL_MINUTES} 分钟
      </span>
    </div>
  )
}
