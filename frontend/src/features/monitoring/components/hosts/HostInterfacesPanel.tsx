'use client'

import { useMemo, useState } from 'react'
import type { HostInterfaceDetail } from '../../types/zabbix-monitoring.types'
import {
  formatInterfaceSpeed,
  resolveHostInterfaceDescription,
  resolveHostInterfaceDisplayName,
} from './hostDisplayHelpers'
import { HostInterfaceDualChart } from './HostInterfaceDualChart'

export interface HostInterfacesPanelProps {
  deviceId: number
  interfaces: HostInterfaceDetail[]
}

const VIRTUAL_NAME_PATTERN = /^(loopback|null|vlanif|console|lo\d*$)/i

function isVirtualOrUnmanaged(iface: HostInterfaceDetail): boolean {
  if (!iface.lld_monitored) return true
  const label = resolveHostInterfaceDisplayName(iface)
  return VIRTUAL_NAME_PATTERN.test(label)
}

function PortStatusBadge({ iface }: { iface: HostInterfaceDetail }) {
  const linkUp = iface.is_up === true
  return (
    <div className="flex items-center gap-1">
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
          linkUp
            ? 'bg-success-soft text-success-soft-foreground'
            : 'bg-unknown-soft text-unknown-soft-foreground'
        }`}
      >
        {linkUp ? 'UP' : 'DOWN'}
      </span>
      {!iface.admin_up && (
        <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] text-muted-foreground">
          管理关闭
        </span>
      )}
    </div>
  )
}

function UtilizationBar({ iface }: { iface: HostInterfaceDetail }) {
  if (iface.speed_unknown) {
    return <span className="text-muted-foreground">—</span>
  }
  const peak = Math.max(iface.utilization_in, iface.utilization_out)
  const pct = Math.min(100, Math.max(0, peak))
  return (
    <div className="inline-flex items-center gap-1.5 tabular-nums">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${
            pct >= 85 ? 'bg-danger' : pct >= 65 ? 'bg-warning' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct.toFixed(1)}%</span>
    </div>
  )
}

function InterfaceRow({
  iface,
  selected,
  onSelect,
}: {
  iface: HostInterfaceDetail
  selected: boolean
  onSelect: () => void
}) {
  const errorsTotal = iface.in_errors + iface.out_errors
  const discardsTotal = iface.in_discards + iface.out_discards
  const portName = resolveHostInterfaceDisplayName(iface)
  const portDescription = resolveHostInterfaceDescription(iface)

  return (
    <tr
      onClick={onSelect}
      className={`h-9 cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/50 ${
        selected ? 'bg-primary/5' : ''
      }`}
    >
      <td className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-medium text-foreground">{portName || '—'}</span>
          {iface.flap_count_1h > 0 && (
            <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-soft-foreground tabular-nums">
              闪断 {iface.flap_count_1h} 次
            </span>
          )}
        </div>
        {portDescription !== '' && (
          <div className="text-[11px] text-muted-foreground">{portDescription}</div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <PortStatusBadge iface={iface} />
      </td>
      <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
        {formatInterfaceSpeed(iface.speed, iface.speed_unknown)}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">{iface.duplex_status || '—'}</td>
      <td className="px-2 py-1.5 text-right">
        <UtilizationBar iface={iface} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        <span className={errorsTotal > 0 ? 'font-semibold text-danger' : 'text-foreground'}>
          {errorsTotal}
        </span>
        {' / '}
        <span className={discardsTotal > 0 ? 'font-semibold text-warning' : 'text-muted-foreground'}>
          {discardsTotal}
        </span>
      </td>
    </tr>
  )
}

export function HostInterfacesPanel({
  deviceId,
  interfaces,
}: HostInterfacesPanelProps) {
  const [hideVirtual, setHideVirtual] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const filtered = useMemo(
    () => (hideVirtual ? interfaces.filter((i) => !isVirtualOrUnmanaged(i)) : interfaces),
    [hideVirtual, interfaces]
  )
  const activeIface = useMemo(
    () => filtered.find((i) => i.name === selectedName) ?? null,
    [filtered, selectedName]
  )

  return (
    <div className="space-y-3">
      {activeIface && <HostInterfaceDualChart deviceId={deviceId} iface={activeIface} />}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          共 {filtered.length} 个端口 · 点击任意端口行可展开上/下行速率与错包双轨图
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-foreground">
          <input
            type="checkbox"
            checked={hideVirtual}
            onChange={(e) => setHideVirtual(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-primary"
          />
          <span>隐藏虚拟/未纳管端口</span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="h-8 border-b border-border bg-surface-2 text-muted-foreground">
              <th className="px-2.5 font-medium">端口名称 / 描述</th>
              <th className="px-2 font-medium">运行状态</th>
              <th className="px-2 font-medium">速率</th>
              <th className="px-2 font-medium">双工</th>
              <th className="px-2 text-right font-medium">峰值利用率</th>
              <th className="px-2 text-right font-medium">错包 / 丢包</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无符合条件的端口信息
                </td>
              </tr>
            ) : (
              filtered.map((iface) => (
                <InterfaceRow
                  key={iface.id}
                  iface={iface}
                  selected={iface.name === selectedName}
                  onSelect={() =>
                    setSelectedName((prev) => (prev === iface.name ? null : iface.name))
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
