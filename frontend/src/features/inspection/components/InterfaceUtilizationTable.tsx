/**
 * 接口利用率明细表
 *
 * 巡检「接口利用率」检查项会把逐接口结果写进 inspection_results.details，
 * 本组件负责把它渲染成完整清单：已评估接口按利用率降序 + 未评估接口及原因。
 * 默认折叠——设备接口数可达数十个，展开后才占据版面。
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { InterfaceUtilizationDetails, InterfaceUtilizationEntry } from '../types'
import { formatBandwidth } from '@/utils/formatters'
import { cn } from '@/utils/cn'

interface InterfaceUtilizationTableProps {
  details: InterfaceUtilizationDetails
}

/** 按阈值给利用率上色：故障红、警告黄、正常绿 */
const utilizationTone = (percent: number, warning: number, critical: number): string => {
  if (percent >= critical) return 'text-red-600 dark:text-red-400'
  if (percent >= warning) return 'text-amber-600 dark:text-amber-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

/** 利用率进度条宽度：低于 1% 也给 1% 的可见宽度，避免看起来像没有数据 */
const barWidth = (percent: number): string => {
  if (percent <= 0) return '0%'
  return `${Math.min(100, Math.max(1, percent))}%`
}

const barTone = (percent: number, warning: number, critical: number): string => {
  if (percent >= critical) return 'bg-red-500'
  if (percent >= warning) return 'bg-amber-500'
  return 'bg-emerald-500'
}

const UtilizationRow = ({
  entry,
  warning,
  critical,
}: {
  entry: InterfaceUtilizationEntry
  warning: number
  critical: number
}) => (
  <tr className="border-b border-border/60 last:border-0">
    <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{entry.name}</td>
    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{entry.direction}</td>
    <td className="py-1.5 pr-3 whitespace-nowrap">
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
          <div
            className={cn('h-full rounded-full', barTone(entry.percent, warning, critical))}
            style={{ width: barWidth(entry.percent) }}
          />
        </div>
        <span className={cn('font-medium tabular-nums', utilizationTone(entry.percent, warning, critical))}>
          {entry.percent < 0.01 && entry.percent > 0 ? '<0.01' : entry.percent.toFixed(2)}%
        </span>
      </div>
    </td>
    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
      {entry.speed_mbps} Mbps
    </td>
    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
      {formatBandwidth(entry.in_rate_bps)}
    </td>
    <td className="py-1.5 text-muted-foreground whitespace-nowrap tabular-nums">
      {formatBandwidth(entry.out_rate_bps)}
    </td>
  </tr>
)

export function InterfaceUtilizationTable({ details }: InterfaceUtilizationTableProps) {
  const [expanded, setExpanded] = useState(false)
  const { interfaces, skipped, warning_threshold: warning, critical_threshold: critical } = details

  if (interfaces.length === 0 && skipped.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        接口利用率明细（已评估 {details.evaluated}/{details.total} 个接口
        {details.over_warning > 0 ? `，${details.over_warning} 个超阈值` : ''}）
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-border bg-background/60 p-3">
          {interfaces.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-normal py-1 pr-3">接口</th>
                    <th className="text-left font-normal py-1 pr-3">峰值方向</th>
                    <th className="text-left font-normal py-1 pr-3">利用率</th>
                    <th className="text-left font-normal py-1 pr-3">带宽容量</th>
                    <th className="text-left font-normal py-1 pr-3">入向速率</th>
                    <th className="text-left font-normal py-1">出向速率</th>
                  </tr>
                </thead>
                <tbody>
                  {interfaces.map((entry) => (
                    <UtilizationRow key={entry.name} entry={entry} warning={warning} critical={critical} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">本次没有可计算利用率的接口。</p>
          )}

          {skipped.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1.5">
                未参与评估的接口（{skipped.length} 个）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skipped.map((item) => (
                  <span
                    key={item.name}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    title={item.reason}
                  >
                    <span className="font-medium text-foreground/70">{item.name}</span>
                    <span className="opacity-70">{item.reason}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
