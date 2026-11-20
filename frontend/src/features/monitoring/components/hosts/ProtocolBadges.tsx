'use client'

import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { formatDateTimeMDHM } from '@/utils/formatters'
import type {
  HostCollectionStateView,
  HostProtocolSummary,
} from '../../types/zabbix-monitoring.types'
import { resolveCollectionErrorText } from './hostDisplayHelpers'

export interface ProtocolBadgesProps {
  protocols: HostProtocolSummary
  collectionState: HostCollectionStateView
}

interface PillTone {
  label: string
  className: string
  detail: string
}

function buildIcmpTone(protocols: HostProtocolSummary): PillTone {
  if (protocols.icmp_healthy) {
    return {
      label: 'ICMP',
      className: 'bg-success-soft text-success-soft-foreground',
      detail: 'ICMP 连通性正常',
    }
  }
  return {
    label: 'ICMP',
    className:
      protocols.icmp_status === 'offline'
        ? 'bg-danger-soft text-danger-soft-foreground'
        : 'bg-unknown-soft text-unknown-soft-foreground',
    detail: `ICMP 状态：${protocols.icmp_status || '未知'}`,
  }
}

function buildSnmpTone(
  protocols: HostProtocolSummary,
  collectionState: HostCollectionStateView
): PillTone {
  if (protocols.snmp_healthy) {
    return {
      label: 'SNMP',
      className: 'bg-success-soft text-success-soft-foreground',
      detail: 'SNMP 采集正常',
    }
  }
  const errorText = resolveCollectionErrorText(collectionState)
  if (protocols.snmp_status === 'not_configured') {
    return {
      label: 'SNMP',
      className: 'bg-unknown-soft text-unknown-soft-foreground',
      detail: '未配置 SNMP 凭据',
    }
  }
  return {
    label: 'SNMP',
    className: collectionState.in_backoff
      ? 'bg-warning-soft text-warning-soft-foreground'
      : 'bg-danger-soft text-danger-soft-foreground',
    detail: errorText || `SNMP 异常：${protocols.snmp_status || '失败'}`,
  }
}

function buildCliTone(protocols: HostProtocolSummary): PillTone {
  if (protocols.cli_configured) {
    const protoName = protocols.cli_protocol.toUpperCase()
    return {
      label: protoName === 'TELNET' ? 'TELNET' : 'CLI',
      className: 'bg-info-soft text-info-soft-foreground',
      detail: `已配置 ${protoName} 管理通道`,
    }
  }
  return {
    label: 'CLI',
    className: 'bg-unknown-soft text-unknown-soft-foreground',
    detail: '未配置 SSH/Telnet',
  }
}

export function ProtocolBadges({ protocols, collectionState }: ProtocolBadgesProps) {
  const [hovered, setHovered] = useState(false)
  const errorText = resolveCollectionErrorText(collectionState)
  const pills = [
    buildIcmpTone(protocols),
    buildSnmpTone(protocols, collectionState),
    buildCliTone(protocols),
  ]

  const hasDiag = Boolean(errorText || collectionState.in_backoff)

  return (
    <div
      className="relative inline-flex flex-wrap items-center gap-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {pills.map((pill) => (
        <span
          key={pill.label}
          title={pill.detail}
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${pill.className}`}
        >
          {pill.label}
        </span>
      ))}

      {collectionState.in_backoff && (
        <span className="inline-flex items-center gap-0.5 rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-warning-soft-foreground">
          <ShieldAlert className="h-3 w-3" />
          <span>已自动退避</span>
        </span>
      )}

      {hovered && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-30 mb-1.5 w-64 rounded-lg border border-border bg-card p-2.5 text-xs text-foreground shadow-overlay"
        >
          <div className="space-y-1">
            {pills.map((pill) => (
              <div key={pill.label} className="flex items-start justify-between gap-2">
                <span className="font-medium text-muted-foreground">{pill.label}</span>
                <span className="text-right text-foreground">{pill.detail}</span>
              </div>
            ))}
          </div>
          {hasDiag && (
            <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-warning-soft-foreground">
              {errorText && (
                <p>
                  失败原因：{errorText}
                  {collectionState.last_error_code ? ` (${collectionState.last_error_code})` : ''}
                </p>
              )}
              {collectionState.in_backoff && (
                <p className="mt-0.5 tabular-nums">
                  退避熔断中：已连续失败 {collectionState.consecutive_failures} 次
                  {collectionState.backoff_until
                    ? `，恢复时间 ${formatDateTimeMDHM(collectionState.backoff_until)}`
                    : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
