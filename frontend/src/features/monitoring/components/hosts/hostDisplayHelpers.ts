import type {
  HostCollectionStateView,
  HostDetailResponse,
  HostMatrixItem,
} from '../../types/zabbix-monitoring.types'

export interface StatusBadgeMeta {
  label: string
  className: string
}

const HOST_STATUS_MAP: Readonly<Record<string, StatusBadgeMeta>> = {
  online: {
    label: '正常',
    className: 'bg-success-soft text-success-soft-foreground',
  },
  warning: {
    label: '负载偏高',
    className: 'bg-warning-soft text-warning-soft-foreground',
  },
  critical: {
    label: '过载告警',
    className: 'bg-danger-soft text-danger-soft-foreground',
  },
  offline: {
    label: '离线',
    className: 'bg-unknown-soft text-unknown-soft-foreground',
  },
  maintenance: {
    label: '维护中',
    className: 'bg-info-soft text-info-soft-foreground',
  },
}

const COLLECTION_ERROR_LABELS: Readonly<Record<string, string>> = {
  auth_failed: '认证失败（请检查 SNMP 团体字或凭据）',
  timeout: '采集请求超时',
  unreachable: '设备网络不可达',
  unsupported_oid: '设备不支持该采集指标',
  rate_limited: '采集触发限流保护',
}

export function getHostStatusMeta(status: string): StatusBadgeMeta {
  return (
    HOST_STATUS_MAP[status.toLowerCase()] ?? {
      label: status || '未知',
      className: 'bg-unknown-soft text-unknown-soft-foreground',
    }
  )
}

export function resolveCollectionErrorText(state: HostCollectionStateView): string {
  const msg = state.last_error_message?.trim()
  if (msg) return msg
  const code = state.last_error_code?.trim()
  if (!code) return ''
  return COLLECTION_ERROR_LABELS[code] ?? code
}

export function formatUptimeChinese(seconds?: number): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }
  const totalSec = Math.floor(seconds)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

export function formatInterfaceSpeed(speedMbps?: number, speedUnknown?: boolean): string {
  if (speedUnknown || speedMbps === undefined || speedMbps === null || speedMbps <= 0) {
    return '— (速率未知)'
  }
  if (speedMbps >= 1000) {
    const gbps = speedMbps / 1000
    return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`
  }
  return `${speedMbps} Mbps`
}

export function buildHostMetricLine(device: HostMatrixItem): string {
  const cpu = device.cpu_usage !== undefined ? `${device.cpu_usage.toFixed(1)}%` : '—'
  const mem = device.memory_usage !== undefined ? `${device.memory_usage.toFixed(1)}%` : '—'
  const temp = device.temperature !== undefined ? `${device.temperature.toFixed(1)}°C` : '—'
  const rtt = device.response_time !== undefined ? `${device.response_time.toFixed(1)}ms` : '—'
  return `CPU ${cpu} | 内存 ${mem} | 温度 ${temp} | Ping RTT ${rtt}`
}

/**
 * 构建脱敏排障诊断摘要（严禁包含任何密码、SNMP 团体字、私钥或 Token）。
 */
export function buildSanitizedDiagnosticSummary(detail: HostDetailResponse): string {
  const { device } = detail
  const statusMeta = getHostStatusMeta(device.status)
  const lines: string[] = [
    `# 设备排障诊断摘要（已脱敏）`,
    `- 设备名称：${device.name} (${device.ip_address})`,
    `- 厂商/型号：${device.vendor || '未知'} / ${device.model || '未知'}`,
    `- 运行状态：${statusMeta.label}${device.in_maintenance ? '（计划维护中）' : ''}`,
    `- 协议状态：ICMP=${device.protocols.icmp_healthy ? '可达' : device.protocols.icmp_status} | SNMP=${device.protocols.snmp_healthy ? '正常' : device.protocols.snmp_status} | CLI=${device.protocols.cli_configured ? device.protocols.cli_protocol.toUpperCase() : '未配置'}`,
    `- 核心指标：${buildHostMetricLine(device)}`,
  ]

  const errText = resolveCollectionErrorText(device.collection_state)
  if (errText || device.collection_state.in_backoff) {
    lines.push(
      `- 采集诊断：${errText || '采集异常'}${device.collection_state.in_backoff ? `（已自动退避，连续失败 ${device.collection_state.consecutive_failures} 次）` : ''}`
    )
  }

  if (detail.permissions.inspections.allowed && detail.latest_inspection) {
    const insp = detail.latest_inspection
    lines.push(
      `- 最近巡检：${insp.score.toFixed(1)} 分（通过 ${insp.passed_checks} / 异常 ${insp.failed_checks} / 警告 ${insp.warning_checks}）`
    )
  }

  const weakOpticals = detail.snmp_extensions.optical_transceivers.filter(
    (item) => (item.rx_power !== undefined && item.rx_power < -20) || (item.tx_power !== undefined && item.tx_power < -10)
  )
  if (weakOpticals.length > 0) {
    lines.push(
      `- 弱光/光模块异常：${weakOpticals.map((o) => `${o.index}(Tx=${o.tx_power ?? '—'}, Rx=${o.rx_power ?? '—'})`).join('；')}`
    )
  }

  if (detail.permissions.alerts.allowed && detail.active_alerts.length > 0) {
    lines.push(`- 活跃告警 (${detail.active_alerts.length} 条)：`)
    detail.active_alerts.slice(0, 5).forEach((a) => {
      lines.push(`  - [${a.severity}] ${a.title}`)
    })
  }

  if (detail.permissions.logs.allowed && detail.recent_logs.length > 0) {
    lines.push(`- 最新异常日志（最多 3 条）：`)
    detail.recent_logs.slice(0, 3).forEach((log) => {
      lines.push(`  - [${log.level.toUpperCase()}/${log.source}] ${log.message}`)
    })
  }

  return lines.join('\n')
}
