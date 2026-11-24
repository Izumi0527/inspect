'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms'
import {
  MONITORING_TOPN_QUERY_KEY,
  getMonitoringTopN,
} from '../../api/monitoring-hosts.api'
import type { ThresholdSummary, TopNMetric } from '../../types/zabbix-monitoring.types'
import {
  formatTopNValue,
  getTopNEmptyMessage,
  resolveTopNBarPresentation,
  resolveTopNInterfaceLabel,
} from './topNRankingHelpers'

interface TopNRankingCardProps {
  groupId: number | null
  deviceIds?: number[]
  thresholds?: ThresholdSummary
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

export function TopNRankingCard({
  groupId,
  deviceIds,
  thresholds,
  onSelectHost,
}: TopNRankingCardProps) {
  const [metric, setMetric] = useState<TopNMetric>('cpu')

  const normalizedDeviceIds = useMemo(
    () =>
      Array.from(
        new Set((deviceIds ?? []).filter((id) => Number.isInteger(id) && id > 0))
      ).sort((a, b) => a - b),
    [deviceIds]
  )
  const deviceIdsKey = normalizedDeviceIds.length > 0 ? normalizedDeviceIds.join(',') : 'all'

  const { data, isLoading, isError } = useQuery({
    queryKey: [MONITORING_TOPN_QUERY_KEY, metric, groupId ?? 'all', deviceIdsKey],
    queryFn: () =>
      normalizedDeviceIds.length > 0
        ? getMonitoringTopN(metric, 5, groupId, normalizedDeviceIds)
        : getMonitoringTopN(metric, 5, groupId),
    staleTime: 30_000,
    retry: 1,
  })

  const items = data?.items ?? []
  const maxValue = Math.max(
    1,
    ...items.map((item) => (Number.isFinite(item.value) ? item.value : 0))
  )
  const isInterfaceMetric = metric === 'if_util' || metric === 'if_errors'

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
          <p className="py-6 text-center text-sm text-muted-foreground">
            {getTopNEmptyMessage(metric)}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const interfaceLabel = isInterfaceMetric ? resolveTopNInterfaceLabel(item) : ''
              const secondaryLabel = isInterfaceMetric
                ? interfaceLabel
                : item.ip_address?.trim() ?? ''
              const formattedValue = formatTopNValue(metric, item)
              const bar = resolveTopNBarPresentation(metric, item.value, maxValue, thresholds)
              const titleParts = [
                item.device_name,
                item.ip_address?.trim() ? `(${item.ip_address.trim()})` : '',
                interfaceLabel,
                formattedValue,
              ].filter(Boolean)

              return (
                <button
                  key={`${item.device_id}-${item.interface_name ?? ''}-${idx}`}
                  type="button"
                  title={titleParts.join(' · ')}
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
                      {secondaryLabel && (
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {secondaryLabel}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold text-foreground tabular-nums">
                      {formattedValue}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      data-testid={`topn-bar-${idx}`}
                      data-severity={bar.severity}
                      className={`h-full rounded-full transition-all ${bar.barClassName}`}
                      style={{ width: `${bar.widthPct}%` }}
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
