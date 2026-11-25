'use client'

import { useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BellOff, CheckCircle2, ExternalLink, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDateTimeMDHMS, formatDateTimeYMDHMS } from '@/utils/formatters'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { getLatestData } from '../../api/monitoring-hosts.api'
import {
  acknowledgeAlert,
  snoozeAlert,
  unsnoozeAlert,
} from '../../api/monitoring-config.api'
import type {
  ActiveProblemItem,
  HostActiveAlertSummary,
  ModulePermissionStatus,
  SnoozeDurationHours,
} from '../../types/zabbix-monitoring.types'
import {
  buildLatestDataQueryKey,
  filterAndSortLatestDataItems,
  getLatestDataDeltaToneClass,
  resolveLatestDataDeltaDisplay,
  resolveLatestDataMetricTooltip,
  resolveLatestDataPortLabel,
} from '../latest/latestDataHelpers'
import {
  AcknowledgeProblemModal,
  SnoozeProblemModal,
} from '../overview/ProblemActionModals'

type LatestMetricScope = 'all' | 'host' | 'port'

export function HostLatestMetricsPanel({ deviceId }: { deviceId: number }) {
  const [prevDeviceId, setPrevDeviceId] = useState(deviceId)
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState<LatestMetricScope>('all')

  if (prevDeviceId !== deviceId) {
    setPrevDeviceId(deviceId)
    setPage(1)
    setScope('all')
  }

  const query = useQuery({
    queryKey: buildLatestDataQueryKey({
      deviceIds: [deviceId],
      groupId: null,
      applicationTag: '',
      search: '',
      onlyAbnormalOrChanged: false,
      page,
      pageSize: 50,
    }),
    queryFn: () => getLatestData({ device_ids: [deviceId], page, page_size: 50 }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const items = query.data?.items ?? []
  const total = query.data?.total ?? items.length
  const totalPages = Math.max(1, query.data?.total_pages ?? 1)
  const visibleItems = filterAndSortLatestDataItems(items)
  const filteredItems = visibleItems.filter((item) => {
    if (scope === 'host') return item.interface_name.trim() === ''
    if (scope === 'port') return item.interface_name.trim() !== ''
    return true
  })

  if (query.isLoading) {
    return <div className="py-8 text-center text-xs text-muted-foreground">正在加载主机实时指标...</div>
  }
  if (items.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground">暂无最新指标快照</div>
  }

  const scopeOptions: ReadonlyArray<{ value: LatestMetricScope; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'host', label: '整机' },
    { value: 'port', label: '端口' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          共 {total} 项实时指标
        </span>
        <div className="inline-flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
          {scopeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScope(opt.value)}
              aria-pressed={scope === opt.value}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                scope === opt.value
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="h-8 border-b border-border bg-surface-2 text-muted-foreground">
              <th className="px-2.5 font-medium">指标名称</th>
              <th className="px-2 font-medium">端口</th>
              <th className="px-2 text-right font-medium">最新值</th>
              <th className="px-2 text-right font-medium">较上次变化</th>
              <th className="px-2 text-right font-medium">采集时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  当前页暂无符合条件的指标
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const portLabel = resolveLatestDataPortLabel(item)
                const deltaDisplay = resolveLatestDataDeltaDisplay(item)
                const deltaToneClass = getLatestDataDeltaToneClass(item)
                const metricTooltip = resolveLatestDataMetricTooltip(item)

                return (
                  <tr
                    key={`${item.metric_name}-${item.interface_name}-${item.item_key}`}
                    className="h-9 border-b border-border/50 tabular-nums"
                  >
                    <td className="px-2.5 py-1.5">
                      <div className="font-medium text-foreground" title={metricTooltip}>
                        {item.metric_label}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {portLabel === '整机' ? (
                        <span className="inline-flex rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          整机
                        </span>
                      ) : (
                        <span
                          className={`font-mono ${
                            portLabel === '—' ? 'text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {portLabel}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${
                        item.is_abnormal ? 'text-danger' : 'text-foreground'
                      }`}
                    >
                      {item.display_value}
                    </td>
                    <td className={`px-2 py-1.5 text-right whitespace-nowrap ${deltaToneClass}`}>
                      {deltaDisplay}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap"
                      title={formatDateTimeYMDHMS(item.collected_at)}
                    >
                      {formatDateTimeMDHMS(item.collected_at)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}

function toProblemItem(
  alert: HostActiveAlertSummary,
  deviceId: number,
  deviceName: string
): ActiveProblemItem {
  return {
    alert_id: alert.id,
    device_id: deviceId,
    device_name: deviceName,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    metric_name: alert.metric_name,
    current_value: alert.current_value,
    threshold_value: alert.threshold_value,
    last_occurred: alert.last_occurred,
    snoozed_until: alert.snoozed_until,
  }
}

export function HostActiveAlertsPanel({
  deviceId,
  deviceName,
  alerts,
  permission,
  onMutated,
}: {
  deviceId: number
  deviceName: string
  alerts: HostActiveAlertSummary[]
  permission: ModulePermissionStatus
  onMutated: () => void
}) {
  const canUpdateAlerts = usePermission(Permission.ALERTS_UPDATE)
  const [ackTarget, setAckTarget] = useState<ActiveProblemItem | null>(null)
  const [snoozeTarget, setSnoozeTarget] = useState<ActiveProblemItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!permission.allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 p-4 text-xs text-muted-foreground">
        <Lock className="h-4 w-4 text-warning" />
        <span>当前账号缺少告警查看权限（alerts:read），活跃告警已安全隐藏。</span>
      </div>
    )
  }

  const handleAck = async (payload: { note?: string; assignee?: string }) => {
    if (!ackTarget) return
    setSubmitting(true)
    try {
      await acknowledgeAlert(ackTarget.alert_id, payload)
      toast.success('已完成接手确认')
      setAckTarget(null)
      onMutated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '接手确认失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSnooze = async (hours: SnoozeDurationHours, reason: string) => {
    if (!snoozeTarget) return
    setSubmitting(true)
    try {
      await snoozeAlert(snoozeTarget.alert_id, { duration_hours: hours, reason })
      toast.success(`已临时静默该告警 ${hours} 小时`)
      setSnoozeTarget(null)
      onMutated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '临时静默失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnsnooze = async (alertId: number) => {
    try {
      await unsnoozeAlert(alertId)
      toast.success('已取消临时静默')
      onMutated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消静默失败')
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground tabular-nums">
            共 {alerts.length} 条活跃告警
          </span>
          <Link
            href={`/alerts?device_id=${deviceId}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            前往告警中心查看全部
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-8 text-center">
            <CheckCircle2 className="mb-2 h-6 w-6 text-success" />
            <p className="text-xs font-medium text-foreground">该设备当前无活跃告警</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-soft-foreground">
                      {alert.severity === 'critical' ? '严重' : '警告'}
                    </span>
                    <span className="font-semibold text-foreground">{alert.title}</span>
                    {alert.status === 'acknowledged' && (
                      <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] text-info-soft-foreground">
                        已接手
                      </span>
                    )}
                    {alert.snoozed_until && (
                      <span className="inline-flex items-center gap-1 rounded bg-unknown-soft px-1.5 py-0.5 text-[11px] text-unknown-soft-foreground">
                        <BellOff className="h-3 w-3" />
                        已静默
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {alert.current_value !== undefined && `当前值 ${alert.current_value}`}
                    {alert.threshold_value !== undefined && ` · 阈值 ${alert.threshold_value}`}
                  </p>
                </div>

                {canUpdateAlerts && (
                  <div className="flex items-center gap-1.5">
                    {alert.status !== 'acknowledged' && (
                      <button
                        type="button"
                        onClick={() =>
                          setAckTarget(toProblemItem(alert, deviceId, deviceName))
                        }
                        className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                      >
                        接手确认
                      </button>
                    )}
                    {alert.snoozed_until ? (
                      <button
                        type="button"
                        onClick={() => void handleUnsnooze(alert.id)}
                        className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                      >
                        取消静默
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setSnoozeTarget(toProblemItem(alert, deviceId, deviceName))
                        }
                        className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                      >
                        临时静默
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AcknowledgeProblemModal
        problem={ackTarget}
        submitting={submitting}
        onClose={() => setAckTarget(null)}
        onConfirm={(p) => void handleAck(p)}
      />
      <SnoozeProblemModal
        problem={snoozeTarget}
        submitting={submitting}
        onClose={() => setSnoozeTarget(null)}
        onConfirm={(h, r) => void handleSnooze(h, r)}
      />
    </>
  )
}
