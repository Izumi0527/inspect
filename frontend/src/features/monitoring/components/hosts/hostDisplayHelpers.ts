import type {
  HostCollectionStateView,
  HostDetailResponse,
  HostInterfaceDetail,
  HostMatrixItem,
  SNMPComponentStatusMetrics,
  SNMPOpticalTransceiverMetrics,
} from '../../types/zabbix-monitoring.types'

export interface StatusBadgeMeta {
  label: string
  className: string
}

export interface TopologyRoleMeta {
  label: string
  sourceLabel: string
  className: string
}

const TOPOLOGY_ROLE_MAP: Readonly<Record<string, StatusBadgeMeta>> = {
  core: {
    label: '核心',
    className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  aggregation: {
    label: '汇聚',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  distribution: {
    label: '汇聚',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  access: {
    label: '接入',
    className: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  },
  router: {
    label: '路由',
    className: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  },
  firewall: {
    label: '防火墙',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
  edge: {
    label: '终端',
    className: 'bg-surface-2 text-muted-foreground',
  },
  endpoint: {
    label: '终端',
    className: 'bg-surface-2 text-muted-foreground',
  },
}

const TOPOLOGY_ROLE_SOURCE_MAP: Readonly<Record<string, string>> = {
  type: '按设备类型',
  name: '按名称识别',
  inferred: '按拓扑推断',
}

export function resolveTopologyRoleMeta(role?: string, source?: string): TopologyRoleMeta {
  const rawRole = role?.trim() ?? ''
  const key = rawRole.toLowerCase()
  const badge = !key
    ? TOPOLOGY_ROLE_MAP.access
    : TOPOLOGY_ROLE_MAP[key] ?? {
        label: rawRole,
        className: 'bg-surface-2 text-muted-foreground',
      }
  const sourceKey = source?.trim().toLowerCase() ?? ''
  return {
    label: badge.label,
    sourceLabel: TOPOLOGY_ROLE_SOURCE_MAP[sourceKey] ?? '',
    className: badge.className,
  }
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

export function isSyntheticInterfaceKey(name?: string): boolean {
  return /^if\d+$/i.test((name ?? '').trim())
}

const NON_PHYSICAL_INTERFACE_PREFIX_RE =
  /^(?:vlanif|vlan-interface|vlan|inloopback|loopback|lo|null|console|aux|eth-trunk|bridge-aggregation|route-aggregation|port-channel|tunnel|virtual-template|dialer|vbdif|vsi|meth|m-gigabitethernet|m-ethernet|m-eth|management|mgmt|stack-port|css-port|bvi|irb|nve|bridge-if|cellular|async|serial)(?:$|[-\/\s\d])/i

const SUB_INTERFACE_NAME_RE = /^[^.\s].*\.\d+$/

/**
 * 判断端口名称是否属于虚拟/逻辑/管理/堆叠/三层子接口等非物理端口（与后端 devices.IsNonPhysicalInterface 对齐）。
 */
export function isNonPhysicalInterfaceName(name?: string): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return false
  if (NON_PHYSICAL_INTERFACE_PREFIX_RE.test(trimmed)) return true
  return SUB_INTERFACE_NAME_RE.test(trimmed)
}

export function resolveHostInterfaceDisplayName(
  iface: Pick<HostInterfaceDetail, 'name' | 'alias' | 'display_name'>
): string {
  const displayName = iface.display_name?.trim()
  if (displayName) return displayName
  if (isSyntheticInterfaceKey(iface.name)) {
    return iface.alias?.trim() || ''
  }
  return iface.name.trim()
}

export function resolveHostInterfaceDescription(
  iface: Pick<HostInterfaceDetail, 'name' | 'alias' | 'display_name' | 'description'>
): string {
  if (iface.description !== undefined) {
    return iface.description.trim()
  }
  const alias = iface.alias?.trim()
  if (!isSyntheticInterfaceKey(iface.name) && alias && alias !== resolveHostInterfaceDisplayName(iface)) {
    return alias
  }
  return ''
}

const NON_NEGATIVE_OPTICAL_UNITS = new Set([
  'uw',
  '0.1uw',
  'mw',
  'mv',
  '0.1mv',
  'ua',
  '0.1ua',
])

function isOpticalMetricPresent(value?: number, unit?: string): boolean {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return false
  }
  const normalizedUnit = (unit ?? '').trim().toLowerCase()
  if (NON_NEGATIVE_OPTICAL_UNITS.has(normalizedUnit)) {
    return value > 0
  }
  return true
}

export function convertOpticalPowerToDBm(value?: number, unit?: string): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null
  }
  const normalizedUnit = (unit ?? '').trim().toLowerCase()
  if (normalizedUnit === '0.1uw') {
    const uw = value / 10
    return uw <= 0 ? null : 10 * Math.log10(uw / 1000)
  }
  if (normalizedUnit === 'uw') {
    return value <= 0 ? null : 10 * Math.log10(value / 1000)
  }
  if (normalizedUnit === 'mw') {
    return value <= 0 ? null : 10 * Math.log10(value)
  }
  if (normalizedUnit === '' || normalizedUnit === 'dbm') {
    return value
  }
  return value
}

export function isOpticalTransceiverActive(item: SNMPOpticalTransceiverMetrics): boolean {
  return (
    isOpticalMetricPresent(item.tx_power, item.tx_power_unit) ||
    isOpticalMetricPresent(item.rx_power, item.rx_power_unit) ||
    isOpticalMetricPresent(item.bias_current, item.bias_current_unit) ||
    isOpticalMetricPresent(item.voltage, item.voltage_unit)
  )
}

export function isOpticalTransceiverWeak(item: SNMPOpticalTransceiverMetrics): boolean {
  const rxDbm = convertOpticalPowerToDBm(item.rx_power, item.rx_power_unit)
  const txDbm = convertOpticalPowerToDBm(item.tx_power, item.tx_power_unit)
  return (rxDbm !== null && rxDbm < -20) || (txDbm !== null && txDbm < -10)
}

export function formatOpticalPower(value?: number, unit?: string): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '—'
  }
  const dbm = convertOpticalPowerToDBm(value, unit)
  if (dbm === null) {
    return '无光信号'
  }
  return `${dbm.toFixed(2)} dBm`
}

export function formatOpticalBiasCurrent(value?: number, unit?: string): string {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    return '—'
  }
  const rawUnit = (unit ?? '').trim()
  const normalizedUnit = rawUnit.toLowerCase()
  if (normalizedUnit === 'ua') {
    return `${(value / 1000).toFixed(1)} mA`
  }
  if (normalizedUnit === '0.1ua') {
    return `${(value / 10000).toFixed(1)} mA`
  }
  return `${value.toFixed(1)} ${rawUnit || 'mA'}`
}

export function formatOpticalVoltage(value?: number, unit?: string): string {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    return '—'
  }
  const rawUnit = (unit ?? '').trim()
  const normalizedUnit = rawUnit.toLowerCase()
  if (normalizedUnit === 'mv') {
    return `${(value / 1000).toFixed(2)} V`
  }
  if (normalizedUnit === '0.1mv') {
    return `${(value / 10000).toFixed(2)} V`
  }
  return `${value.toFixed(2)} ${rawUnit || 'V'}`
}

export function resolveOpticalPortLabel(
  item: SNMPOpticalTransceiverMetrics,
  position: number
): string {
  const name = item.name?.trim()
  if (name) return name
  const index = item.index?.trim() ?? ''
  if (index && !/^\d{6,}$/.test(index)) {
    return index
  }
  return `光口 #${position}`
}

export function resolveComponentDisplayName(
  comp: SNMPComponentStatusMetrics,
  kindLabel: string,
  kindPosition: number
): string {
  const name = comp.name?.trim()
  if (name) return name
  const index = comp.index?.trim() ?? ''
  const slotMatch = /^(\d+)\.(\d+)$/.exec(index)
  if (slotMatch) {
    return `槽位 ${slotMatch[1]} · ${kindLabel} ${slotMatch[2]}`
  }
  if (/^\d{1,4}$/.test(index)) {
    return `${kindLabel} ${index}`
  }
  if (index && !/^\d+$/.test(index)) {
    return `${kindLabel} ${index}`
  }
  return `${kindLabel} ${kindPosition}`
}

export function resolveComponentStatusMeta(comp: SNMPComponentStatusMetrics): StatusBadgeMeta {
  const level = comp.status_level?.trim().toLowerCase()
  if (level) {
    switch (level) {
      case 'normal':
        return {
          label: comp.status_label?.trim() || '正常',
          className: 'bg-success-soft text-success-soft-foreground',
        }
      case 'warning':
        return {
          label: comp.status_label?.trim() || '告警',
          className: 'bg-warning-soft text-warning-soft-foreground',
        }
      case 'critical':
        return {
          label: comp.status_label?.trim() || '异常',
          className: 'bg-danger-soft text-danger-soft-foreground',
        }
      default:
        return {
          label: comp.status_label?.trim() || '未知',
          className: 'bg-unknown-soft text-unknown-soft-foreground',
        }
    }
  }

  if (comp.kind?.toLowerCase() === 'board' && comp.state === 3) {
    return {
      label: '正常',
      className: 'bg-success-soft text-success-soft-foreground',
    }
  }
  if (comp.state === 1 || comp.state === 0) {
    return {
      label: '正常',
      className: 'bg-success-soft text-success-soft-foreground',
    }
  }
  if (comp.state === 2) {
    return {
      label: '异常',
      className: 'bg-danger-soft text-danger-soft-foreground',
    }
  }
  return {
    label: comp.state !== undefined ? `状态 ${comp.state}` : '未知',
    className: 'bg-unknown-soft text-unknown-soft-foreground',
  }
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

function appendSNMPDiagnosticsSummary(lines: string[], detail: HostDetailResponse): void {
  const diag = detail.snmp_extensions.diagnostics
  if (!diag) return

  const vendorLabel = diag.effective_vendor || detail.device.vendor || '未知'
  const parts = [`厂商=${vendorLabel}`]
  if (diag.sys_object_id) {
    parts.push(`sysObjectID=${diag.sys_object_id}`)
  }
  if (diag.enterprise_mapped && diag.canonical_prefix && diag.active_prefix) {
    parts.push(`企业前缀重映射=${diag.canonical_prefix}->${diag.active_prefix}`)
  }
  parts.push(`耗时=${diag.total_elapsed_ms}ms`)
  lines.push(`- SNMP 识别：${parts.join(' | ')}`)

  const abnormal = (diag.candidates ?? []).filter(
    (c) => c.status !== 'hit' || Boolean(c.error_class) || c.elapsed_ms >= 500
  )
  if (abnormal.length > 0) {
    lines.push(`- SNMP 异常/慢候选（${abnormal.length} 项）：`)
    abnormal.slice(0, 6).forEach((c) => {
      const errSuffix = c.error_class ? `, err=${c.error_class}` : ''
      lines.push(
        `  - [${c.category}] ${c.candidate_id} (${c.oid}): ${c.status}, rows=${c.rows}, ${c.elapsed_ms}ms${errSuffix}`
      )
    })
  }
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

  appendSNMPDiagnosticsSummary(lines, detail)

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

  const activeOpticals = detail.snmp_extensions.optical_transceivers.filter(
    isOpticalTransceiverActive
  )
  const weakOpticals = activeOpticals
    .map((item, idx) => ({ item, label: resolveOpticalPortLabel(item, idx + 1) }))
    .filter(({ item }) => isOpticalTransceiverWeak(item))
  if (weakOpticals.length > 0) {
    lines.push(
      `- 弱光/光模块异常：${weakOpticals
        .map(
          ({ item, label }) =>
            `${label}(Tx=${formatOpticalPower(item.tx_power, item.tx_power_unit)}, Rx=${formatOpticalPower(item.rx_power, item.rx_power_unit)})`
        )
        .join('；')}`
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
