'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BellOff, CheckCircle2, ExternalLink, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms'
import { formatDateTimeMDHM } from '@/utils/formatters'
import {
  acknowledgeAlert,
  snoozeAlert,
  unsnoozeAlert,
} from '../../api/monitoring-config.api'
import type {
  ActiveProblemItem,
  SnoozeDurationHours,
} from '../../types/zabbix-monitoring.types'
import { AcknowledgeProblemModal, SnoozeProblemModal } from './ProblemActionModals'
import {
  formatProblemMetricLabel,
  formatProblemMetricValue,
  getProblemSeverityMeta,
  isAlertActivelySnoozed,
} from './activeProblemHelpers'

interface ActiveProblemsCardProps {
  problems?: ActiveProblemItem[]
  canReadAlerts: boolean
  canUpdateAlerts: boolean
  onSelectHost?: (deviceId: number) => void
  onActionSuccess?: () => void
}

const EMPTY_PROBLEMS: ActiveProblemItem[] = []

function buildSnoozeTooltip(snoozedUntil?: string, snoozeReason?: string): string {
  const parts: string[] = []
  const reason = snoozeReason?.trim()
  if (reason) {
    parts.push(`原因：${reason}`)
  }
  if (snoozedUntil) {
    const ts = Date.parse(snoozedUntil)
    if (Number.isFinite(ts)) {
      parts.push(`截止 ${formatDateTimeMDHM(new Date(ts))}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : '已临时静默'
}

export function ActiveProblemsCard({
  problems = EMPTY_PROBLEMS,
  canReadAlerts,
  canUpdateAlerts,
  onSelectHost,
  onActionSuccess,
}: ActiveProblemsCardProps) {
  const [ackTarget, setAckTarget] = useState<ActiveProblemItem | null>(null)
  const [snoozeTarget, setSnoozeTarget] = useState<ActiveProblemItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [unsnoozingId, setUnsnoozingId] = useState<number | null>(null)
  const [ackedIds, setAckedIds] = useState<Record<number, boolean>>({})
  const [snoozedMap, setSnoozedMap] = useState<Record<number, string>>({})
  const [unsnoozedIds, setUnsnoozedIds] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setAckedIds((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    setSnoozedMap((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    setUnsnoozedIds((prev) => (Object.keys(prev).length === 0 ? prev : {}))
  }, [problems])

  const handleAckConfirm = async (payload: { note?: string; assignee?: string }) => {
    if (!ackTarget) return
    setSubmitting(true)
    try {
      await acknowledgeAlert(ackTarget.alert_id, payload)
      setAckedIds((prev) => ({ ...prev, [ackTarget.alert_id]: true }))
      toast.success('已完成接手确认')
      setAckTarget(null)
      onActionSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '接手确认失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSnoozeConfirm = async (
    durationHours: SnoozeDurationHours,
    reason: string
  ) => {
    if (!snoozeTarget) return
    setSubmitting(true)
    try {
      const res = await snoozeAlert(snoozeTarget.alert_id, {
        duration_hours: durationHours,
        reason,
      })
      setSnoozedMap((prev) => ({
        ...prev,
        [snoozeTarget.alert_id]: res.snoozed_until,
      }))
      setUnsnoozedIds((prev) => {
        if (!prev[snoozeTarget.alert_id]) return prev
        const next = { ...prev }
        delete next[snoozeTarget.alert_id]
        return next
      })
      toast.success(`已临时静默该告警 ${durationHours} 小时`)
      setSnoozeTarget(null)
      onActionSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '临时静默失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnsnooze = async (alertId: number) => {
    setUnsnoozingId(alertId)
    try {
      await unsnoozeAlert(alertId)
      setSnoozedMap((prev) => {
        const next = { ...prev }
        delete next[alertId]
        return next
      })
      setUnsnoozedIds((prev) => ({ ...prev, [alertId]: true }))
      toast.success('已取消临时静默')
      onActionSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消静默失败')
    } finally {
      setUnsnoozingId((prev) => (prev === alertId ? null : prev))
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span>活跃告警与问题</span>
              {canReadAlerts && problems.length > 0 && (
                <span
                  title={
                    problems.length >= 20
                      ? '展示前 20 条，点击前往告警中心查看全部'
                      : undefined
                  }
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
                >
                  {problems.length} 条
                </span>
              )}
            </CardTitle>
            {canReadAlerts && (
              <Link
                href="/alerts"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                前往告警中心
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!canReadAlerts ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/60 p-4 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0 text-warning" />
              <span>
                当前账号缺少告警查看权限（alerts:read），活跃问题列表与告警事件标注已安全隐藏。
              </span>
            </div>
          ) : problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="mb-2 h-7 w-7 text-success" />
              <p className="text-sm font-medium text-foreground">当前无活跃问题</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                纳管设备与链路均运行正常
              </p>
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {problems.map((item) => {
                const sev = getProblemSeverityMeta(item.severity)
                const isAcked = item.status === 'acknowledged' || ackedIds[item.alert_id]
                const effectiveSnoozedUntil = unsnoozedIds[item.alert_id]
                  ? undefined
                  : (snoozedMap[item.alert_id] ?? item.snoozed_until)
                const isSnoozed = isAlertActivelySnoozed(effectiveSnoozedUntil)
                const suppressedBy = item.suppressed_by?.trim()
                const metricLabel = formatProblemMetricLabel(item.metric_name)
                const lastOccurredTs = item.last_occurred
                  ? Date.parse(item.last_occurred)
                  : Number.NaN
                const hasValidLastOccurred = Number.isFinite(lastOccurredTs)

                return (
                  <div
                    key={item.alert_id}
                    className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${sev.className}`}>
                            {sev.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelectHost?.(item.device_id)}
                            className="truncate font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {item.device_name}
                          </button>
                          {isAcked && (
                            <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info-soft-foreground">
                              已接手
                            </span>
                          )}
                          {isSnoozed && (
                            <span
                              title={buildSnoozeTooltip(
                                effectiveSnoozedUntil,
                                item.snooze_reason
                              )}
                              className="inline-flex items-center gap-1 rounded bg-unknown-soft px-1.5 py-0.5 text-[11px] font-medium text-unknown-soft-foreground"
                            >
                              <BellOff className="h-3 w-3" />
                              已静默
                            </span>
                          )}
                          {suppressedBy && (
                            <span
                              title={`由维护策略「${suppressedBy}」抑制`}
                              className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                            >
                              维护静默
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                          {metricLabel && <span>指标 {metricLabel}</span>}
                          {item.current_value !== undefined && (
                            <span>
                              当前值 {formatProblemMetricValue(item.current_value, item.metric_name)}
                            </span>
                          )}
                          {item.threshold_value !== undefined && (
                            <span>
                              阈值 {formatProblemMetricValue(item.threshold_value, item.metric_name)}
                            </span>
                          )}
                          {hasValidLastOccurred && (
                            <span>
                              最近 {formatDateTimeMDHM(new Date(lastOccurredTs))}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {canUpdateAlerts && !isAcked && (
                          <button
                            type="button"
                            onClick={() => setAckTarget(item)}
                            className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                          >
                            接手确认
                          </button>
                        )}
                        {canUpdateAlerts &&
                          (isSnoozed ? (
                            <button
                              type="button"
                              disabled={unsnoozingId === item.alert_id}
                              onClick={() => void handleUnsnooze(item.alert_id)}
                              className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              取消静默
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSnoozeTarget(item)}
                              className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                            >
                              临时静默
                            </button>
                          ))}
                        <Link
                          href={`/alerts?id=${item.alert_id}`}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          详情
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AcknowledgeProblemModal
        problem={ackTarget}
        submitting={submitting}
        onClose={() => setAckTarget(null)}
        onConfirm={(payload) => void handleAckConfirm(payload)}
      />

      <SnoozeProblemModal
        problem={snoozeTarget}
        submitting={submitting}
        onClose={() => setSnoozeTarget(null)}
        onConfirm={(hours, reason) => void handleSnoozeConfirm(hours, reason)}
      />
    </>
  )
}
