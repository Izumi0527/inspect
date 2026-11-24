import { z } from 'zod'
import type { TriggerExpressionMode, TriggerRule } from '../../types/zabbix-monitoring.types'

export interface MetricMeta {
  label: string
  unit: string
}

export const METRIC_META: Record<string, MetricMeta> = {
  temperature: { label: '设备温度', unit: '°C' },
  cpu_usage: { label: 'CPU 使用率', unit: '%' },
  memory_usage: { label: '内存使用率', unit: '%' },
  disk_usage: { label: '磁盘使用率', unit: '%' },
  response_time: { label: 'Ping 响应延迟', unit: 'ms' },
  packet_loss: { label: '丢包率', unit: '%' },
  utilization_in: { label: '端口入向带宽利用率', unit: '%' },
  utilization_out: { label: '端口出向带宽利用率', unit: '%' },
  if_utilization: { label: '端口带宽利用率', unit: '%' },
  if_in_errors: { label: '端口入方向错包', unit: '个/秒' },
  flap_count_1h: { label: '端口 1 小时闪断次数', unit: '次' },
  uptime: { label: '设备连续运行时长', unit: '秒' },
}

const EXTRA_METRIC_META: Record<string, MetricMeta> = {
  bandwidth_in: { label: '入站带宽', unit: 'bps' },
  bandwidth_out: { label: '出站带宽', unit: 'bps' },
  network_bytes_in: { label: '入站带宽', unit: 'bps' },
  network_bytes_out: { label: '出站带宽', unit: 'bps' },
  if_out_errors: { label: '端口出方向错包', unit: '个/秒' },
}

const METRIC_ALIAS_MAP: Record<string, string> = {
  temperature: 'temperature',
  temp: 'temperature',
  cpu_temperature: 'temperature',
  device_temperature: 'temperature',
  cpu_usage: 'cpu_usage',
  cpu: 'cpu_usage',
  cpu_utilization: 'cpu_usage',
  cpu_load: 'cpu_usage',
  memory_usage: 'memory_usage',
  memory: 'memory_usage',
  mem_usage: 'memory_usage',
  mem_utilization: 'memory_usage',
  disk_usage: 'disk_usage',
  disk: 'disk_usage',
  disk_utilization: 'disk_usage',
  storage_usage: 'disk_usage',
  response_time: 'response_time',
  ping_rtt_ms: 'response_time',
  'icmp.rtt': 'response_time',
  icmp_rtt: 'response_time',
  latency: 'response_time',
  rtt: 'response_time',
  packet_loss: 'packet_loss',
  ping_loss_pct: 'packet_loss',
  loss_rate: 'packet_loss',
  utilization_in: 'utilization_in',
  if_utilization_in: 'utilization_in',
  utilization_out: 'utilization_out',
  if_utilization_out: 'utilization_out',
  if_utilization: 'if_utilization',
  utilization: 'if_utilization',
  if_in_errors: 'if_in_errors',
  flap_count_1h: 'flap_count_1h',
  if_flap_count_1h: 'flap_count_1h',
  uptime: 'uptime',
  sys_uptime: 'uptime',
  system_uptime: 'uptime',
}

/**
 * 将后端及采集器中的多套指标命名规范化为前端下拉选项统一键。
 */
export function normalizeTriggerMetricName(metricName: string): string {
  const trimmed = (metricName ?? '').trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  return METRIC_ALIAS_MAP[lower] ?? trimmed
}

/**
 * 解析指标的中文展示名称与单位，兜底消除规则卡片上的裸英文指标名。
 */
export function resolveMetricMeta(metricName: string): MetricMeta {
  const normalized = normalizeTriggerMetricName(metricName)
  if (!normalized) {
    return { label: '监测指标', unit: '' }
  }
  const lower = normalized.toLowerCase()
  return (
    METRIC_META[normalized] ??
    METRIC_META[lower] ??
    EXTRA_METRIC_META[normalized] ??
    EXTRA_METRIC_META[lower] ?? { label: normalized, unit: '' }
  )
}

export const SEVERITY_META: Record<
  string,
  { label: string; badgeVariant: 'danger' | 'warning' | 'info' }
> = {
  critical: { label: '严重告警', badgeVariant: 'danger' },
  warning: { label: '警告告警', badgeVariant: 'warning' },
  info: { label: '提示告警', badgeVariant: 'info' },
}

export const OPERATOR_LABELS: Record<string, string> = {
  '>': '高于',
  '>=': '达到或高于',
  '<': '低于',
  '<=': '降至或低于',
  '==': '等于',
  '!=': '不等于',
}

export const EXPRESSION_MODE_OPTIONS: ReadonlyArray<{
  value: TriggerExpressionMode
  label: string
  hint: string
}> = [
  { value: 'threshold', label: '常规阈值超限', hint: '指标持续超出阈值达到设定时长后触发' },
  { value: 'hysteresis', label: '防抖动滞后恢复', hint: '触发线与恢复线分离，防止临界值反复告警' },
  { value: 'nodata', label: '采集断流检测', hint: '设备长时间未上报任何新指标时告警' },
  { value: 'uptime_drop', label: '设备异常重启', hint: '检测到设备运行时长骤降时立即告警' },
  { value: 'if_flap', label: '端口频繁闪断', hint: '端口短时间内反复通断切换时触发告警' },
]

export const DEPENDENCY_MODE_OPTIONS: ReadonlyArray<{
  value: 'none' | 'lldp_upstream' | 'manual_device'
  label: string
}> = [
  { value: 'none', label: '不屏蔽（独立评估告警）' },
  { value: 'lldp_upstream', label: '自动按拓扑上级防风暴（推荐）' },
  { value: 'manual_device', label: '手动指定上级父设备' },
]

export function formatDurationCN(seconds: number): string {
  if (seconds <= 0) return '立即'
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60} 分钟`
  }
  return `${seconds} 秒`
}

export interface TriggerSummaryDraft {
  expression_mode: string
  metric_name: string
  operator: string
  threshold_value: number
  duration: number
  severity: string
  recovery_operator?: string
  recovery_threshold?: number | null
  nodata_seconds?: number
  dependency_mode?: string
}

export function formatTriggerNaturalSummary(rule: TriggerSummaryDraft | TriggerRule): string {
  const metric = resolveMetricMeta(rule.metric_name)
  const sev = SEVERITY_META[rule.severity.toLowerCase()]?.label ?? '告警'
  const durSeconds =
    typeof rule.duration === 'number' && Number.isFinite(rule.duration) ? rule.duration : 0
  const dur = formatDurationCN(durSeconds)
  const op = OPERATOR_LABELS[rule.operator] ?? rule.operator

  if (rule.expression_mode === 'nodata') {
    const nodataSeconds =
      typeof rule.nodata_seconds === 'number' && Number.isFinite(rule.nodata_seconds)
        ? rule.nodata_seconds
        : 300
    const wait = formatDurationCN(nodataSeconds)
    return `当${metric.label}超过 ${wait}未上报新数据时，触发${sev}（采集断流）`
  }
  if (rule.expression_mode === 'uptime_drop') {
    return `当检测到设备运行时长骤降（异常重启）时，立即触发${sev}`
  }
  if (rule.expression_mode === 'if_flap') {
    const count =
      typeof rule.threshold_value === 'number' && Number.isFinite(rule.threshold_value)
        ? rule.threshold_value
        : 4
    return `当端口 1 小时内状态频繁闪断达到 ${count} 次时，触发${sev}`
  }

  const thresholdValue =
    typeof rule.threshold_value === 'number' && Number.isFinite(rule.threshold_value)
      ? rule.threshold_value
      : 0
  const base = `当${metric.label}${durSeconds > 0 ? `连续 ${dur}` : ''}${op} ${thresholdValue}${metric.unit} 触发${sev}`
  if (
    rule.expression_mode === 'hysteresis' &&
    rule.recovery_threshold !== null &&
    rule.recovery_threshold !== undefined &&
    Number.isFinite(rule.recovery_threshold)
  ) {
    const recPhrase =
      rule.recovery_operator === '<' || rule.recovery_operator === '<='
        ? `降至 ${rule.recovery_threshold}${metric.unit} 以下`
        : rule.recovery_operator === '>' || rule.recovery_operator === '>='
          ? `回升至 ${rule.recovery_threshold}${metric.unit} 以上`
          : `${OPERATOR_LABELS[rule.recovery_operator || '<'] ?? '恢复至'} ${rule.recovery_threshold}${metric.unit}`
    return `${base}；${recPhrase}自动恢复`
  }
  return base
}

const optionalFiniteNumber = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null
    const num = Number(val)
    return Number.isFinite(num) ? num : Number.NaN
  },
  z.union([z.number().finite(), z.nan(), z.null()]).optional()
)

const optionalPositiveInt = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null
    const num = Number(val)
    return Number.isFinite(num) ? num : Number.NaN
  },
  z.union([z.number().int().positive(), z.nan(), z.null()]).optional()
)

export const triggerFormSchema = z
  .object({
    name: z.string().trim().min(1, '请填写规则名称').max(128, '名称不超过 128 字符'),
    severity: z.enum(['critical', 'warning', 'info']),
    expression_mode: z.enum(['threshold', 'hysteresis', 'nodata', 'uptime_drop', 'if_flap']),
    metric_name: z.string().trim().min(1, '请选择监测指标'),
    operator: z.enum(['>', '>=', '<', '<=', '==', '!=']),
    threshold_value: z.coerce.number().finite('请输入有效阈值数字'),
    duration: z.coerce.number().int().min(0, '持续时长不能为负数').max(86400),
    cooldown_minutes: z.coerce
      .number()
      .int('冷却时间必须为整数')
      .min(0, '冷却时间不能为负数')
      .max(1440, '冷却时间不超过 1440 分钟')
      .default(15),
    recovery_operator: z.enum(['>', '>=', '<', '<=', '==', '!=']).default('<'),
    recovery_threshold: optionalFiniteNumber,
    nodata_seconds: z.coerce.number().int().min(60, '断流等待至少 60 秒').max(86400).default(600),
    dependency_mode: z.enum(['none', 'lldp_upstream', 'manual_device']).default('none'),
    depends_on_device_id: optionalPositiveInt,
    entity_filter_regex: z.string().trim().max(256, '端口匹配条件不超过 256 字符').default(''),
    is_active: z.boolean().default(true),
    notification_enabled: z.boolean().default(true),
    email_enabled: z.boolean().default(false),
    webhook_enabled: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.expression_mode === 'hysteresis') {
      if (typeof val.recovery_threshold !== 'number' || !Number.isFinite(val.recovery_threshold)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recovery_threshold'],
          message: '防抖动模式下请填写有效的恢复阈值',
        })
      } else {
        const triggerUpper = val.operator === '>' || val.operator === '>='
        const recoveryLower = val.recovery_operator === '<' || val.recovery_operator === '<='
        if (triggerUpper && recoveryLower && val.recovery_threshold >= val.threshold_value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['recovery_threshold'],
            message: '高于阈值触发时，恢复阈值必须小于触发阈值',
          })
        }

        const triggerLower = val.operator === '<' || val.operator === '<='
        const recoveryUpper = val.recovery_operator === '>' || val.recovery_operator === '>='
        if (triggerLower && recoveryUpper && val.recovery_threshold <= val.threshold_value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['recovery_threshold'],
            message: '低于阈值触发时，恢复阈值必须大于触发阈值',
          })
        }
      }
    }

    if (val.dependency_mode === 'manual_device') {
      if (
        typeof val.depends_on_device_id !== 'number' ||
        !Number.isInteger(val.depends_on_device_id) ||
        val.depends_on_device_id <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['depends_on_device_id'],
          message: '手动指定模式下请选择有效的上级父设备',
        })
      }
    }
  })

export type TriggerFormValues = z.infer<typeof triggerFormSchema>
