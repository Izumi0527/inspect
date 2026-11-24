'use client'

import { Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms'
import type { HealthDistributionBuckets } from '../../types/zabbix-monitoring.types'

interface HealthDistributionBarProps {
  distribution?: HealthDistributionBuckets
  onSelectBucket?: (status: string) => void
  activeAlertCount?: number
  canReadAlerts?: boolean
}

interface BucketMeta {
  key: keyof HealthDistributionBuckets
  label: string
  statusFilter: string
  barClass: string
  pillClass: string
}

const BUCKET_METAS: readonly BucketMeta[] = [
  {
    key: 'normal',
    label: '正常',
    statusFilter: 'online',
    barClass: 'bg-success',
    pillClass: 'bg-success-soft text-success-soft-foreground hover:opacity-90',
  },
  {
    key: 'elevated',
    label: '负载偏高',
    statusFilter: 'warning',
    barClass: 'bg-warning',
    pillClass: 'bg-warning-soft text-warning-soft-foreground hover:opacity-90',
  },
  {
    key: 'overloaded',
    label: '过载',
    statusFilter: 'critical',
    barClass: 'bg-danger',
    pillClass: 'bg-danger-soft text-danger-soft-foreground hover:opacity-90',
  },
  {
    key: 'offline',
    label: '离线',
    statusFilter: 'offline',
    barClass: 'bg-unknown',
    pillClass: 'bg-unknown-soft text-unknown-soft-foreground hover:opacity-90',
  },
  {
    key: 'maintenance',
    label: '维护中',
    statusFilter: 'maintenance',
    barClass: 'bg-info',
    pillClass: 'bg-info-soft text-info-soft-foreground hover:opacity-90',
  },
]

export function HealthDistributionBar({
  distribution,
  onSelectBucket,
  activeAlertCount,
  canReadAlerts = false,
}: HealthDistributionBarProps) {
  if (!distribution) return null

  const total =
    distribution.normal +
    distribution.elevated +
    distribution.overloaded +
    distribution.offline +
    distribution.maintenance

  if (total <= 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            <span>全网健康与负载分布</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canReadAlerts && typeof activeAlertCount === 'number' && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                  activeAlertCount > 0
                    ? 'bg-danger-soft text-danger-soft-foreground'
                    : 'bg-success-soft text-success-soft-foreground'
                }`}
              >
                活跃告警 {activeAlertCount}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              共 {total} 台纳管设备 · 点击色段下钻设备监控
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="group"
          aria-label="全网健康分布条"
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          {BUCKET_METAS.map((bucket) => {
            const count = distribution[bucket.key]
            if (count <= 0) return null
            const pct = (count / total) * 100
            return (
              <button
                key={bucket.key}
                type="button"
                aria-label={`${bucket.label} ${count} 台`}
                style={{ width: `${pct}%` }}
                onClick={() => onSelectBucket?.(bucket.statusFilter)}
                className={`h-full transition-opacity hover:opacity-85 focus-visible:outline-none ${bucket.barClass}`}
                title={`${bucket.label}: ${count} 台 (${pct.toFixed(1)}%)`}
              />
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {BUCKET_METAS.map((bucket) => {
            const count = distribution[bucket.key]
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => onSelectBucket?.(bucket.statusFilter)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity ${bucket.pillClass}`}
              >
                <span className={`h-2 w-2 rounded-full ${bucket.barClass}`} aria-hidden="true" />
                <span>{bucket.label}</span>
                <span className="font-semibold tabular-nums">{count}</span>
                <span className="opacity-75 tabular-nums">({pct}%)</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
