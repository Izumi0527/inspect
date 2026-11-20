'use client'

import Link from 'next/link'
import { ExternalLink, GitBranch, Lock, ShieldCheck } from 'lucide-react'
import { formatDateTimeMDHM } from '@/utils/formatters'
import type {
  HostDetailResponse,
  HostInspectionSummary,
  HostNeighborSummary,
} from '../../types/zabbix-monitoring.types'
import { formatUptimeChinese } from './hostDisplayHelpers'

export interface HostOverviewPanelProps {
  detail: HostDetailResponse
  onSelectHost: (deviceId: number) => void
}

function MetricSummaryGrid({ detail }: { detail: HostDetailResponse }) {
  const { device, thresholds } = detail
  const cards = [
    {
      label: 'CPU 使用率',
      value: device.cpu_usage !== undefined ? `${device.cpu_usage.toFixed(1)}%` : '—',
      sub: `预警 ${thresholds.cpu.warn}% / 严重 ${thresholds.cpu.crit}%`,
    },
    {
      label: '内存使用率',
      value: device.memory_usage !== undefined ? `${device.memory_usage.toFixed(1)}%` : '—',
      sub: `预警 ${thresholds.memory.warn}% / 严重 ${thresholds.memory.crit}%`,
    },
    {
      label: '设备温度',
      value: device.temperature !== undefined ? `${device.temperature.toFixed(1)}°C` : '—',
      sub: `预警 ${thresholds.temperature.warn}°C / 严重 ${thresholds.temperature.crit}°C`,
    },
    {
      label: 'Ping 延迟',
      value: device.response_time !== undefined ? `${device.response_time.toFixed(1)} ms` : '—',
      sub: `运行时长 ${formatUptimeChinese(device.uptime)}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-surface-2/40 p-3 text-xs"
        >
          <p className="text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
            {card.value}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  )
}

function FingerprintCard({ detail }: { detail: HostDetailResponse }) {
  const { device } = detail
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 text-xs">
      <h4 className="mb-2.5 font-semibold text-foreground">设备指纹与生效方案</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">主机名：</span>
          <span className="font-medium text-foreground">{device.hostname || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">序列号：</span>
          <span className="font-mono text-foreground">{detail.serial_number || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">固件版本：</span>
          <span className="text-foreground">{detail.firmware_version || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">所属分组：</span>
          <span className="text-foreground">{device.group_name || '未分组'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">机房/位置：</span>
          <span className="text-foreground">{detail.location || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">拓扑角色：</span>
          <span className="text-foreground">{detail.topology_role || 'access'}</span>
        </div>
      </div>
    </section>
  )
}

function InspectionReportCard({
  deviceId,
  allowed,
  inspection,
}: {
  deviceId: number
  allowed: boolean
  inspection?: HostInspectionSummary
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          最近巡检报告（来自巡检管理）
        </h4>
        {allowed && (
          <Link
            href={`/inspection?device_id=${deviceId}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            查看完整巡检报告
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      {!allowed ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-warning" />
          当前账号缺少巡检查看权限（inspections:read）。
        </p>
      ) : !inspection ? (
        <p className="text-muted-foreground">暂无该设备的历史巡检记录</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/50 px-3 py-2 tabular-nums">
          <span className="text-base font-semibold text-foreground">
            健康分 {inspection.score.toFixed(1)}
          </span>
          <span className="text-muted-foreground">
            通过 {inspection.passed_checks} / 异常 {inspection.failed_checks} / 警告{' '}
            {inspection.warning_checks}
          </span>
          {inspection.completed_at && (
            <span className="text-muted-foreground">
              {formatDateTimeMDHM(inspection.completed_at)}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function NeighborsCard({
  deviceId,
  neighbors,
  onSelectHost,
}: {
  deviceId: number
  neighbors: HostNeighborSummary[]
  onSelectHost: (deviceId: number) => void
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          上下游直连邻居关系（{neighbors.length}）
        </h4>
        <Link
          href={`/dashboard?focusDevice=${deviceId}`}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          在全网拓扑中定位
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {neighbors.length === 0 ? (
        <p className="text-muted-foreground">暂未发现 LLDP 直连邻居</p>
      ) : (
        <div className="space-y-1.5">
          {neighbors.map((nb, idx) => (
            <div
              key={`${nb.local_port}-${nb.remote_name}-${idx}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
            >
              <span className="font-mono text-muted-foreground">
                本端 {nb.local_port} → {nb.remote_port || '对端'}
              </span>
              {nb.remote_device_id ? (
                <button
                  type="button"
                  onClick={() => onSelectHost(nb.remote_device_id as number)}
                  className="font-semibold text-primary hover:underline"
                >
                  {nb.remote_name}
                  {nb.remote_mgmt_ip ? ` (${nb.remote_mgmt_ip})` : ''}
                </button>
              ) : (
                <span className="font-medium text-foreground">
                  {nb.remote_name}
                  {nb.remote_mgmt_ip ? ` (${nb.remote_mgmt_ip})` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function HostOverviewPanel({ detail, onSelectHost }: HostOverviewPanelProps) {
  return (
    <div className="space-y-3.5">
      <MetricSummaryGrid detail={detail} />
      <FingerprintCard detail={detail} />
      <InspectionReportCard
        deviceId={detail.device.id}
        allowed={detail.permissions.inspections.allowed}
        inspection={detail.latest_inspection}
      />
      <NeighborsCard
        deviceId={detail.device.id}
        neighbors={detail.neighbors}
        onSelectHost={onSelectHost}
      />
    </div>
  )
}
