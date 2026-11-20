'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms'
import { getMonitoringTopN } from '../../api/monitoring-hosts.api'
import type { TopNMetric } from '../../types/zabbix-monitoring.types'

interface TopNRankingCardProps {
  groupId: number | null
  onSelectHost?: (deviceId: number) => void
}

const METRIC_OPTIONS: ReadonlyArray<{ key: TopNMetric; label: string }> = [
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: '内存' },
  { key: 'temperature', label: '温度' },
  { key: 'if_util', label: '接口利用率' },
  { key: 'if_errors', label: '错包' },
  { key: 'ping_rtt', label: '延迟' },
]

export function TopNRankingCard({ groupId, onSelectHost }: TopNRankingCardProps) {
  const [metric, setMetric] = useState<TopNMetric>('cpu')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['monitoring-topn', metric, groupId ?? 'all'],
    queryFn: () => getMonitoringTopN(metric, 5, groupId),
    staleTime: 30_000,
    retry: 1,
  })

  const items = data?.items ?? []
  const maxValue = Math.max(
    1,
    ...items.map((item) => (Number.isFinite(item.value) ? item.value : 0))
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span>全网负载 Top 5 排行</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="TopN 指标切换">
            {METRIC_OPTIONS.map((opt) => {
              const active = metric === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMetric(opt.key)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-9 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-danger">Top 5 排行加载失败</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">暂无排行数据</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const ratio =
                metric === 'cpu' || metric === 'memory' || metric === 'if_util'
                  ? Math.min(100, Math.max(0, item.value))
                  : Math.min(100, Math.max(4, (item.value / maxValue) * 100))

              return (
                <button
                  key={`${item.device_id}-${item.interface_name ?? ''}-${idx}`}
                  type="button"
                  onClick={() => onSelectHost?.(item.device_id)}
                  className="w-full rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-3 text-xs font-semibold text-foreground tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {item.device_name}
                      </span>
                      {item.interface_name && (
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {item.interface_name}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold text-foreground tabular-nums">
                      {item.value.toFixed(item.unit === 'count' ? 0 : 1)} {item.unit}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full ${
                        ratio >= 85 ? 'bg-danger' : ratio >= 65 ? 'bg-warning' : 'bg-primary'
                      }`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
