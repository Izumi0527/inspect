'use client'

import Link from 'next/link'
import { ExternalLink, FileText, Lock, Radio } from 'lucide-react'
import { formatDateTimeMDHMS } from '@/utils/formatters'
import type {
  HostLogSummary,
  ModulePermissionStatus,
} from '../../types/zabbix-monitoring.types'

export interface HostCrossPagePanelProps {
  deviceId: number
  logs: HostLogSummary[]
  errorLogCount24h?: number
  trapLogCount24h?: number
  permission: ModulePermissionStatus
}

function levelBadgeClass(level: string): string {
  const norm = level.toLowerCase()
  if (norm === 'critical' || norm === 'error') {
    return 'bg-danger-soft text-danger-soft-foreground'
  }
  if (norm === 'warning' || norm === 'warn') {
    return 'bg-warning-soft text-warning-soft-foreground'
  }
  return 'bg-info-soft text-info-soft-foreground'
}

export function HostCrossPagePanel({
  deviceId,
  logs,
  errorLogCount24h = 0,
  trapLogCount24h = 0,
  permission,
}: HostCrossPagePanelProps) {
  if (!permission.allowed) {
    return (
      <div className="rounded-xl border border-border bg-surface-2/60 p-5">
        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">暂无关联日志查看权限</p>
            <p className="mt-1 text-xs">
              当前账号缺少日志查看权限（{permission.requiredPermission ?? 'system:logs'}），近 24 小时异常 Syslog 与 SNMP Trap 摘要已安全隐藏。
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/40 p-3">
        <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <FileText className="h-3.5 w-3.5 text-danger" />
            近 24h 错误/严重日志：
            <strong className="font-semibold">{errorLogCount24h}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Radio className="h-3.5 w-3.5 text-warning" />
            SNMP Trap 事件：
            <strong className="font-semibold">{trapLogCount24h}</strong>
          </span>
        </div>

        <Link
          href={`/logs?device_id=${deviceId}&level=error`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          前往日志中心看全部
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-8 text-center text-xs text-muted-foreground">
          近 24 小时暂无异常 Syslog 或 SNMP Trap 记录
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-border bg-card p-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${levelBadgeClass(log.level)}`}
                  >
                    {log.level}
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {log.source === 'trap' ? 'SNMP Trap' : log.source}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatDateTimeMDHMS(log.log_timestamp)}
                </span>
              </div>
              <p className="mt-1.5 break-words text-foreground">{log.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
