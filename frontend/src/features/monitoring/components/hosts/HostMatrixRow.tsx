'use client'

import { AlertTriangle, Lock, Star, Wrench } from 'lucide-react'
import type { HostMatrixItem } from '../../types/zabbix-monitoring.types'
import { getHostStatusMeta } from './hostDisplayHelpers'
import { HostSparkline } from './HostSparkline'
import { ProtocolBadges } from './ProtocolBadges'

function InspectionScoreCell({
  host,
  allowed,
}: {
  host: HostMatrixItem
  allowed: boolean
}) {
  if (!allowed) {
    return (
      <span
        title="缺少巡检查看权限 (inspections:read)"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Lock className="h-3 w-3" />
        无巡检权限
      </span>
    )
  }
  if (host.latest_inspection_score === undefined || host.latest_inspection_score === null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const score = host.latest_inspection_score
  const tone =
    score >= 90 ? 'text-success' : score >= 75 ? 'text-warning' : 'text-danger'
  return <span className={`font-semibold tabular-nums ${tone}`}>{score.toFixed(0)} 分</span>
}

function AbnormalLogCell({
  host,
  allowed,
}: {
  host: HostMatrixItem
  allowed: boolean
}) {
  if (!allowed) {
    return (
      <span
        title="缺少日志查看权限 (system:logs)"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Lock className="h-3 w-3" />
        无日志权限
      </span>
    )
  }
  const errCount = host.error_log_count_24h ?? 0
  const trapCount = host.trap_log_count_24h ?? 0
  if (errCount === 0 && trapCount === 0) {
    return <span className="text-xs text-muted-foreground tabular-nums">0</span>
  }
  return (
    <div className="inline-flex items-center gap-1 tabular-nums">
      {errCount > 0 && (
        <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-soft-foreground">
          错误 {errCount}
        </span>
      )}
      {trapCount > 0 && (
        <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning-soft-foreground">
          Trap {trapCount}
        </span>
      )}
    </div>
  )
}

export interface HostMatrixRowProps {
  host: HostMatrixItem
  selected: boolean
  inspectionsAllowed: boolean
  logsAllowed: boolean
  onToggleSelect: (deviceId: number) => void
  onTogglePin: (deviceId: number, currentlyPinned: boolean) => void
  onSelectHost: (deviceId: number) => void
}

export function HostMatrixRow({
  host,
  selected,
  inspectionsAllowed,
  logsAllowed,
  onToggleSelect,
  onTogglePin,
  onSelectHost,
}: HostMatrixRowProps) {
  const statusMeta = getHostStatusMeta(host.status)

  return (
    <tr
      onClick={() => onSelectHost(host.id)}
      className="h-9 cursor-pointer border-b border-border/60 bg-card transition-colors hover:bg-accent/50"
    >
      <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`选择 ${host.name}`}
          checked={selected}
          onChange={() => onToggleSelect(host.id)}
          className="h-3.5 w-3.5 rounded border-input accent-primary"
        />
      </td>
      <td className="px-1.5 py-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={host.is_pinned ? `取消关注 ${host.name}` : `关注 ${host.name}`}
          onClick={() => onTogglePin(host.id, host.is_pinned)}
          className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-warning"
        >
          <Star className={`h-3.5 w-3.5 ${host.is_pinned ? 'fill-warning text-warning' : ''}`} />
        </button>
      </td>
      <td className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
          <span className="truncate font-medium text-foreground">{host.name}</span>
          {host.in_maintenance && (
            <span
              title={host.maintenance?.name ?? '计划维护中'}
              className="inline-flex items-center gap-0.5 rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info-soft-foreground"
            >
              <Wrench className="h-3 w-3" />
              维护中
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <span className="font-mono">{host.ip_address}</span>
          {host.model && <span className="truncate">{host.model}</span>}
          {host.group_name && <span className="truncate">· {host.group_name}</span>}
        </div>
      </td>
      <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
        <ProtocolBadges protocols={host.protocols} collectionState={host.collection_state} />
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums">
        <div className="inline-flex items-center justify-end gap-2">
          <HostSparkline points={host.sparkline} value={host.cpu_usage} />
          <span className="w-12 font-medium text-foreground">
            {host.cpu_usage !== undefined ? `${host.cpu_usage.toFixed(1)}%` : '—'}
          </span>
        </div>
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">
        {host.memory_usage !== undefined ? `${host.memory_usage.toFixed(1)}%` : '—'}
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">
        {host.temperature !== undefined ? `${host.temperature.toFixed(1)}°C` : '—'}
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">
        {host.response_time !== undefined ? `${host.response_time.toFixed(1)}ms` : '—'}
      </td>
      <td className="px-2.5 py-1.5 text-right tabular-nums">
        <div className="inline-flex items-center justify-end gap-1.5">
          <span className="text-foreground">
            {host.interfaces_up}/{host.interfaces_total}
          </span>
          {host.hardware_fault_count > 0 && (
            <span
              title={`硬件故障 ${host.hardware_fault_count} 项`}
              className="inline-flex items-center gap-0.5 rounded bg-danger-soft px-1 py-0.5 text-[10px] font-medium text-danger-soft-foreground"
            >
              <AlertTriangle className="h-3 w-3" />
              {host.hardware_fault_count}
            </span>
          )}
        </div>
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <InspectionScoreCell host={host} allowed={inspectionsAllowed} />
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <AbnormalLogCell host={host} allowed={logsAllowed} />
      </td>
    </tr>
  )
}
