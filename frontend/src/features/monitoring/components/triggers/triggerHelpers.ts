import { z } from 'zod'
import type { TriggerExpressionMode, TriggerRule } from '../../types/zabbix-monitoring.types'

export const METRIC_META: Record<string, { label: string; unit: string }> = {
  temperature: { label: '设备温度', unit: '°C' },
  cpu_usage: { label: 'CPU 使用率', unit: '%' },
  memory_usage: { label: '内存使用率', unit: '%' },
  icmp_rtt: { label: 'Ping 往返延迟', unit: 'ms' },
  packet_loss: { label: '丢包率', unit: '%' },
  if_utilization: { label: '端口带宽利用率', unit: '%' },
  if_in_errors: { label: '端口入方向错包', unit: '个/秒' },
  if_flap_count_1h: { label: '端口 1 小时闪断次数', unit: '次' },
  sys_uptime: { label: '设备连续运行时长', unit: '秒' },
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
  const metric = METRIC_META[rule.metric_name] ?? { label: rule.metric_name || '监测指标', unit: '' }
  const sev = SEVERITY_META[rule.severity.toLowerCase()]?.label ?? '告警'
  const dur = formatDurationCN(rule.duration || 0)
  const op = OPERATOR_LABELS[rule.operator] ?? rule.operator

  if (rule.expression_mode === 'nodata') {
    const wait = formatDurationCN(rule.nodata_seconds || 300)
    return `当${metric.label}超过 ${wait}未上报新数据时，触发${sev}（采集断流）`
  }
  if (rule.expression_mode === 'uptime_drop') {
    return `当检测到设备运行时长骤降（异常重启）时，立即触发${sev}`
  }
  if (rule.expression_mode === 'if_flap') {
    const count = rule.threshold_value > 0 ? rule.threshold_value : 4
    return `当端口 1 小时内状态频繁闪断达到 ${count} 次时，触发${sev}`
  }

  const base = `当${metric.label}${rule.duration > 0 ? `连续 ${dur}` : ''}${op} ${rule.threshold_value}${metric.unit} 触发${sev}`
  if (
    rule.expression_mode === 'hysteresis' &&
    rule.recovery_threshold !== null &&
    rule.recovery_threshold !== undefined
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

export const triggerFormSchema = z.object({
  name: z.string().trim().min(1, '请填写规则名称').max(128, '名称不超过 128 字符'),
  severity: z.enum(['critical', 'warning', 'info']),
  expression_mode: z.enum(['threshold', 'hysteresis', 'nodata', 'uptime_drop', 'if_flap']),
  metric_name: z.string().trim().min(1, '请选择监测指标'),
  operator: z.enum(['>', '>=', '<', '<=', '==', '!=']),
  threshold_value: z.coerce.number().finite('请输入有效阈值数字'),
  duration: z.coerce.number().int().min(0, '持续时长不能为负数').max(86400),
  recovery_operator: z.enum(['>', '>=', '<', '<=', '==', '!=']).default('<'),
  recovery_threshold: z.union([z.coerce.number().finite(), z.nan(), z.null()]).optional(),
  nodata_seconds: z.coerce.number().int().min(60, '断流等待至少 60 秒').max(86400).default(600),
  dependency_mode: z.enum(['none', 'lldp_upstream', 'manual_device']).default('none'),
  depends_on_device_id: z.union([z.coerce.number().int().positive(), z.nan(), z.null()]).optional(),
  entity_filter_regex: z.string().trim().max(256, '端口匹配条件不超过 256 字符').default(''),
  is_active: z.boolean().default(true),
  notification_enabled: z.boolean().default(true),
  email_enabled: z.boolean().default(false),
  webhook_enabled: z.boolean().default(false),
})

export type TriggerFormValues = z.infer<typeof triggerFormSchema>
