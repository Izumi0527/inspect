import { z } from 'zod'
import type {
  LLDPresetFlags,
  MonitorItem,
  MonitorLLDRule,
  PreprocessStep,
  TemplateDetailResponse,
  TemplateMacro,
} from '../../types/zabbix-monitoring.types'

export const SNMP_OID_REGEX = /^\.?[0-9]+(\.[0-9]+){2,32}$/

export const PROTOCOL_OPTIONS: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: 'snmp_oid', label: 'SNMP 指标读取', hint: '按设备 OID 节点读取状态或数值' },
  { value: 'icmp', label: 'Ping 连通性', hint: '探测设备往返延迟与可达性' },
  { value: 'tcp_port', label: 'TCP 端口存活', hint: '检测指定业务端口是否开放监听' },
  { value: 'http', label: 'HTTP 网页检查', hint: '按协议、端口与路径检查设备管理页' },
]

export const PROTOCOL_LABELS: Record<string, string> = {
  builtin: '系统内置采集',
  snmp_oid: 'SNMP 指标读取',
  icmp: 'Ping 连通性',
  tcp_port: 'TCP 端口存活',
  http: 'HTTP 网页检查',
}

export const VALUE_TYPE_LABELS: Record<string, string> = {
  float: '数值（小数）',
  uint: '整数',
  string: '文本状态',
}

export const PREPROCESS_TYPE_OPTIONS: ReadonlyArray<{
  value: string
  label: string
  hint: string
}> = [
  { value: 'change_per_sec', label: '自动算每秒速率（流量/错包累计值）', hint: '自动差值并兼容计数器翻转' },
  { value: 'multiplier', label: '单位倍率换算（如 ×8 字节转比特）', hint: '按填写系数对数值做乘法换算' },
  { value: 'regex', label: '文本正则提取（从返回文本截取数值）', hint: '用括号捕获组提取所需片段' },
  { value: 'valuemap', label: '数字转中文状态（1→正常、2→断开）', hint: '结合下方状态对照表翻译显示文案' },
]

export const LLD_ENTITY_TYPE_LABELS: Record<string, string> = {
  interface: '网络端口',
  optical: '光模块',
  bgp: 'BGP 邻居',
  disk: '存储分区',
}

export const KEEP_LOST_DAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '0 天（拔线后立即清理）' },
  { value: 3, label: '3 天' },
  { value: 7, label: '7 天（推荐）' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
]

export const DEFAULT_LLD_SAMPLES = [
  'GigabitEthernet0/0/1',
  'XGigabitEthernet0/0/2',
  'Eth-Trunk1',
  'LoopBack0',
  'Null0',
  'Vlanif100',
]

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw !== 'string') return raw as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function parseTemplateMacros(tpl: TemplateDetailResponse): TemplateMacro[] {
  if (Array.isArray(tpl.macros) && tpl.macros.length > 0) return tpl.macros
  const parsed = parseJsonSafe<unknown>(tpl.macros_json, [])
  return Array.isArray(parsed) ? (parsed as TemplateMacro[]) : []
}

export function parseItemPreprocessSteps(item?: MonitorItem | null): PreprocessStep[] {
  if (!item) return []
  const parsed = parseJsonSafe<unknown>(item.preprocessing_json, [])
  return Array.isArray(parsed) ? (parsed as PreprocessStep[]) : []
}

export function parseItemValueMap(item?: MonitorItem | null): Record<string, string> {
  if (!item) return {}
  const parsed = parseJsonSafe<unknown>(item.value_map_json, {})
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function parseLLDPresetFlags(rule?: MonitorLLDRule | null): LLDPresetFlags {
  const defaults: LLDPresetFlags = {
    ignore_virtual: true,
    ignore_idle: false,
    highlight_uplink: true,
  }
  if (!rule) return defaults
  const parsed = parseJsonSafe<Partial<LLDPresetFlags>>(rule.preset_flags_json, {})
  return {
    ignore_virtual: parsed.ignore_virtual ?? defaults.ignore_virtual,
    ignore_idle: parsed.ignore_idle ?? defaults.ignore_idle,
    highlight_uplink: parsed.highlight_uplink ?? defaults.highlight_uplink,
  }
}

export function parseDeviceOverrideMap(raw?: string): Record<string, string> {
  if (!raw) return {}
  const parsed = parseJsonSafe<unknown>(raw, {})
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = String(v)
  }
  return out
}

export const itemFormSchema = z
  .object({
    item_key: z.string().trim().min(1, '请填写指标唯一标识').max(128, '长度不能超过 128 字符'),
    name: z.string().trim().min(1, '请填写指标名称').max(128, '长度不能超过 128 字符'),
    application_tag: z.string().trim().max(64).default('custom'),
    protocol: z.enum(['builtin', 'snmp_oid', 'icmp', 'tcp_port', 'http']),
    target_expr: z.string().trim().default(''),
    http_scheme: z.enum(['http', 'https']).default('https'),
    http_port: z.coerce.number().int().min(1, '端口需在 1~65535').max(65535, '端口需在 1~65535').default(443),
    http_path: z.string().trim().default('/'),
    value_type: z.enum(['float', 'uint', 'string']).default('float'),
    unit: z.string().trim().max(32).default(''),
    interval_sec: z.coerce.number().int().min(60, '采集周期最低 60 秒').max(86400, '采集周期不能超过 86400 秒'),
    enabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.protocol === 'snmp_oid' && !SNMP_OID_REGEX.test(val.target_expr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_expr'],
        message: '请输入合法的数字点分 OID（例如 .1.3.6.1.4.1.2011.5.25.31）',
      })
    }
    if (val.protocol === 'tcp_port') {
      const port = Number(val.target_expr)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target_expr'],
          message: '请输入有效 TCP 端口号（1~65535）',
        })
      }
    }
    if (val.protocol === 'http') {
      const p = val.http_path
      if (!p.startsWith('/') || p.length > 256) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['http_path'],
          message: '路径必须以 / 开头且不超过 256 字符',
        })
      } else if (p.includes('@') || p.includes('//') || p.includes('://') || /\s/.test(p)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['http_path'],
          message: '路径禁止包含 @、//、:// 或空白字符',
        })
      }
    }
  })

export type ItemFormValues = z.infer<typeof itemFormSchema>
