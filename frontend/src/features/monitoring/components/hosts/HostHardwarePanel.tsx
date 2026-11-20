'use client'

import { Activity, Cpu, HardDrive, Network, Zap } from 'lucide-react'
import type {
  SNMPComponentStatusMetrics,
  SNMPExtensionsResponse,
  SNMPOpticalTransceiverMetrics,
} from '../../types/zabbix-monitoring.types'
import { formatUptimeChinese } from './hostDisplayHelpers'

export interface HostHardwarePanelProps {
  extensions: SNMPExtensionsResponse
}

function isOpticalWeak(item: SNMPOpticalTransceiverMetrics): boolean {
  const weakRx = item.rx_power !== undefined && item.rx_power < -20
  const weakTx = item.tx_power !== undefined && item.tx_power < -10
  return weakRx || weakTx
}

function componentKindLabel(kind: string): string {
  switch (kind.toLowerCase()) {
    case 'fan':
      return '风扇'
    case 'psu':
    case 'power':
      return '电源'
    case 'board':
    case 'slot':
      return '单板'
    default:
      return kind || '硬件模块'
  }
}

function componentStateMeta(comp: SNMPComponentStatusMetrics): {
  label: string
  className: string
} {
  if (comp.state === 1 || comp.state === 0) {
    return {
      label: '正常',
      className: 'bg-success-soft text-success-soft-foreground',
    }
  }
  if (comp.state === 2) {
    return {
      label: '告警',
      className: 'bg-warning-soft text-warning-soft-foreground',
    }
  }
  return {
    label: comp.state !== undefined ? `异常 (${comp.state})` : '未知',
    className: 'bg-danger-soft text-danger-soft-foreground',
  }
}

function bgpStateMeta(state?: number, label?: string): {
  text: string
  className: string
} {
  if (state === 6 || label?.toLowerCase() === 'established') {
    return {
      text: label || '已建立 (Established)',
      className: 'bg-success-soft text-success-soft-foreground',
    }
  }
  return {
    text: label || (state !== undefined ? `状态 ${state}` : '未建立'),
    className: 'bg-warning-soft text-warning-soft-foreground',
  }
}

export function HostHardwarePanel({ extensions }: HostHardwarePanelProps) {
  const { optical_transceivers, components, bgp_peers, poe, stp, disks } = extensions
  const hasAnyData =
    optical_transceivers.length > 0 ||
    components.length > 0 ||
    bgp_peers.length > 0 ||
    (poe?.ports?.length ?? 0) > 0 ||
    poe?.remaining_power !== undefined ||
    stp !== undefined ||
    disks.length > 0

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border border-border bg-card py-10 text-center text-xs text-muted-foreground">
        暂无硬件扩展与链路协议采集数据（请确认设备已开启 SNMP 扩展采集）
      </div>
    )
  }

  const poeConsuming = (poe?.ports ?? []).reduce(
    (sum, p) => sum + (p.consuming_power ?? 0),
    0
  )
  const poeRemaining = poe?.remaining_power ?? 0
  const poeTotal = poeConsuming + poeRemaining
  const poePct = poeTotal > 0 ? Math.min(100, (poeConsuming / poeTotal) * 100) : 0

  return (
    <div className="space-y-4">
      {optical_transceivers.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            光模块光功率监测（{optical_transceivers.length}）
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="h-7 border-b border-border bg-surface-2 text-muted-foreground">
                  <th className="px-2 font-medium">端口/索引</th>
                  <th className="px-2 text-right font-medium">Tx 发送光功率</th>
                  <th className="px-2 text-right font-medium">Rx 接收光功率</th>
                  <th className="px-2 text-right font-medium">偏置电流 / 电压</th>
                  <th className="px-2 text-right font-medium">光路状态</th>
                </tr>
              </thead>
              <tbody>
                {optical_transceivers.map((opt) => {
                  const weak = isOpticalWeak(opt)
                  return (
                    <tr
                      key={opt.index}
                      className={`h-8 border-b border-border/50 tabular-nums ${
                        weak ? 'bg-warning-soft/40' : ''
                      }`}
                    >
                      <td className="px-2 font-mono font-medium text-foreground">{opt.index}</td>
                      <td className="px-2 text-right">
                        {opt.tx_power !== undefined
                          ? `${opt.tx_power.toFixed(2)} ${opt.tx_power_unit ?? 'dBm'}`
                          : '—'}
                      </td>
                      <td className={`px-2 text-right font-medium ${weak ? 'text-danger' : 'text-foreground'}`}>
                        {opt.rx_power !== undefined
                          ? `${opt.rx_power.toFixed(2)} ${opt.rx_power_unit ?? 'dBm'}`
                          : '—'}
                      </td>
                      <td className="px-2 text-right text-muted-foreground">
                        {opt.bias_current !== undefined ? `${opt.bias_current.toFixed(1)}${opt.bias_current_unit ?? 'mA'}` : '—'}
                        {' / '}
                        {opt.voltage !== undefined ? `${opt.voltage.toFixed(2)}${opt.voltage_unit ?? 'V'}` : '—'}
                      </td>
                      <td className="px-2 text-right">
                        {weak ? (
                          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-soft-foreground">
                            弱光告警
                          </span>
                        ) : (
                          <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success-soft-foreground">
                            正常
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {components.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            风扇 / 电源 / 单板健康状态
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {components.map((comp) => {
              const meta = componentStateMeta(comp)
              return (
                <div
                  key={`${comp.kind}-${comp.index}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {componentKindLabel(comp.kind)} #{comp.index}
                    </p>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {bgp_peers.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Network className="h-3.5 w-3.5 text-primary" />
            BGP 邻居状态表（{bgp_peers.length}）
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="h-7 border-b border-border bg-surface-2 text-muted-foreground">
                  <th className="px-2 font-medium">对等体地址 / 索引</th>
                  <th className="px-2 font-medium">会话状态</th>
                  <th className="px-2 text-right font-medium">已建立时长</th>
                  <th className="px-2 font-medium">最近错误</th>
                </tr>
              </thead>
              <tbody>
                {bgp_peers.map((peer) => {
                  const meta = bgpStateMeta(peer.state, peer.state_label)
                  return (
                    <tr key={peer.index} className="h-8 border-b border-border/50 tabular-nums">
                      <td className="px-2 font-mono text-foreground">{peer.index}</td>
                      <td className="px-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
                          {meta.text}
                        </span>
                      </td>
                      <td className="px-2 text-right text-foreground">
                        {formatUptimeChinese(peer.established_time_seconds)}
                      </td>
                      <td className="px-2 text-muted-foreground">{peer.last_error || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(poe || stp || disks.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {poe && (
            <section className="rounded-xl border border-border bg-card p-3.5 text-xs">
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                <Zap className="h-3.5 w-3.5 text-warning" />
                PoE 供电预算
              </h4>
              <div className="flex items-center justify-between text-muted-foreground tabular-nums">
                <span>已用 {poeConsuming.toFixed(1)} W</span>
                <span>剩余 {poeRemaining.toFixed(1)} {poe.remaining_unit ?? 'W'}</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full rounded-full ${poePct >= 85 ? 'bg-danger' : 'bg-primary'}`}
                  style={{ width: `${poePct}%` }}
                />
              </div>
            </section>
          )}

          {stp && (
            <section className="rounded-xl border border-border bg-card p-3.5 text-xs">
              <h4 className="mb-2 font-semibold text-foreground">STP 生成树拓扑变更统计</h4>
              <div className="space-y-1 text-muted-foreground tabular-nums">
                <p>累计拓扑变更次数：<strong className="text-foreground">{stp.top_changes ?? 0}</strong></p>
                <p>距上次变更：{formatUptimeChinese(stp.time_since_topology_change)}</p>
              </div>
            </section>
          )}

          {disks.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-3.5 text-xs md:col-span-2">
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                存储分区占用
              </h4>
              <div className="space-y-2">
                {disks.map((d) => {
                  const pct = d.total_bytes > 0 ? Math.min(100, (d.used_bytes / d.total_bytes) * 100) : 0
                  return (
                    <div key={d.mount} className="space-y-1 tabular-nums">
                      <div className="flex justify-between">
                        <span className="font-mono text-foreground">{d.mount}</span>
                        <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
