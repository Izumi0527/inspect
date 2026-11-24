export interface ProblemSeverityMeta {
  label: string
  className: string
}

const SEVERITY_META_MAP: Readonly<Record<string, ProblemSeverityMeta>> = {
  critical: {
    label: '严重',
    className: 'bg-danger-soft text-danger-soft-foreground',
  },
  fatal: {
    label: '严重',
    className: 'bg-danger-soft text-danger-soft-foreground',
  },
  high: {
    label: '高危',
    className: 'bg-danger-soft text-danger-soft-foreground',
  },
  warning: {
    label: '警告',
    className: 'bg-warning-soft text-warning-soft-foreground',
  },
  medium: {
    label: '警告',
    className: 'bg-warning-soft text-warning-soft-foreground',
  },
  low: {
    label: '提示',
    className: 'bg-info-soft text-info-soft-foreground',
  },
  info: {
    label: '提示',
    className: 'bg-info-soft text-info-soft-foreground',
  },
}

const DEFAULT_SEVERITY_META: ProblemSeverityMeta = {
  label: '提示',
  className: 'bg-info-soft text-info-soft-foreground',
}

const METRIC_LABEL_MAP: Readonly<Record<string, string>> = {
  cpu_usage: 'CPU 使用率',
  memory_usage: '内存使用率',
  temperature: '温度',
  ping_rtt_ms: '响应延迟',
  'icmp.rtt': '响应延迟',
  response_time: '响应延迟',
  ping_loss_pct: '丢包率',
  packet_loss: '丢包率',
  utilization_in: '接口利用率',
  utilization_out: '接口利用率',
  if_in_errors: '接口错包',
  if_out_errors: '接口错包',
  snmp_reachable: 'SNMP 连通性',
  hardware_fault_count: '硬件故障数',
}

const PERCENT_METRICS = new Set([
  'cpu_usage',
  'memory_usage',
  'ping_loss_pct',
  'packet_loss',
  'utilization_in',
  'utilization_out',
])

const LATENCY_METRICS = new Set(['ping_rtt_ms', 'icmp.rtt', 'response_time'])

const COUNT_METRICS = new Set(['if_in_errors', 'if_out_errors', 'hardware_fault_count'])

function compactNumber(value: number, maxDecimals: number): string {
  const rounded = Number(value.toFixed(maxDecimals))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/**
 * 判断告警是否仍处于有效静默期内
 */
export function isAlertActivelySnoozed(
  snoozedUntil?: string,
  nowMs: number = Date.now()
): boolean {
  if (!snoozedUntil || !snoozedUntil.trim()) return false
  const ts = Date.parse(snoozedUntil)
  return Number.isFinite(ts) && ts > nowMs
}

/**
 * 获取告警严重级别的显示文案与样式类
 */
export function getProblemSeverityMeta(severity: string): ProblemSeverityMeta {
  const normalized = severity.trim().toLowerCase()
  return SEVERITY_META_MAP[normalized] ?? DEFAULT_SEVERITY_META
}

/**
 * 将监控指标键名转换为中文友好标签
 */
export function formatProblemMetricLabel(metricName?: string): string {
  const trimmed = metricName?.trim() ?? ''
  if (!trimmed) return ''
  return METRIC_LABEL_MAP[trimmed.toLowerCase()] ?? trimmed
}

/**
 * 结合指标类型格式化告警数值与单位，并防护 NaN/Infinity
 */
export function formatProblemMetricValue(value: number, metricName?: string): string {
  if (!Number.isFinite(value)) return '--'

  const key = metricName?.trim().toLowerCase() ?? ''
  if (PERCENT_METRICS.has(key)) {
    return `${compactNumber(value, 2)}%`
  }
  if (key === 'temperature') {
    return `${compactNumber(value, 1)}°C`
  }
  if (LATENCY_METRICS.has(key)) {
    return `${compactNumber(value, 1)} ms`
  }
  if (COUNT_METRICS.has(key)) {
    return `${Math.round(value)} 个`
  }
  return compactNumber(value, 2)
}
