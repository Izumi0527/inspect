/**
 * 人话翻译层 —— 术语词典
 *
 * 把网络设备的技术词汇转换成日常说法，供规则模板与兜底翻译共用。
 *
 * 注意：本文件刻意不复用 `features/logs/types` 的 LOG_FACILITY_CONFIG。
 * 那里的标签是给筛选器用的短名（「接口」），这里需要的是能嵌进句子的描述
 * （「网络接口」）；且 lib/ 属底层，不应反向依赖 features/。
 */

import type { PlainTone } from './types'

/**
 * 接口类型前缀 → 中文说法。
 *
 * 顺序敏感：长前缀必须排在短前缀之前。
 * 例如 TenGigabitEthernet 若排在 GigabitEthernet 之后，
 * 由于前者包含后者的子串，万兆口会被误译成千兆口。
 * 同理 M-Ethernet（管理口）必须先于 Ethernet。
 */
const INTERFACE_TYPE_RULES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^(?:100GE|HundredGigE)/i, label: '100G 网口' },
  { pattern: /^(?:40GE|FortyGigE)/i, label: '40G 网口' },
  { pattern: /^(?:TenGigabitEthernet|TenGigE|XGigabitEthernet|XGE|10GE)/i, label: '万兆网口' },
  { pattern: /^M-?(?:GigabitEthernet|Ethernet|Eth)/i, label: '管理网口' },
  { pattern: /^(?:GigabitEthernet|GigE|GE)/i, label: '千兆网口' },
  { pattern: /^(?:FastEthernet|FE)/i, label: '百兆网口' },
  { pattern: /^(?:Eth-?Trunk|Port-?channel|Po)/i, label: '聚合链路' },
  { pattern: /^Vlanif/i, label: 'VLAN 虚拟接口' },
  { pattern: /^Loopback/i, label: '环回接口' },
  { pattern: /^Tunnel/i, label: '隧道接口' },
  { pattern: /^NULL/i, label: '空接口' },
  { pattern: /^Ethernet/i, label: '以太网口' },
]

/**
 * 把接口名转成人话，保留槽位/端口编号。
 *
 * 编号（如 0/0/1 表示 0 槽 0 子卡 1 端口）刻意保留：
 * 运维要靠它定位到具体的物理接口，简化成「1 号口」反而让人找不着。
 *
 * @example humanizeInterfaceName('GigabitEthernet0/0/1') // '千兆网口 0/0/1'
 * @example humanizeInterfaceName('Eth-Trunk1')           // '聚合链路 1'
 */
export function humanizeInterfaceName(raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''

  for (const rule of INTERFACE_TYPE_RULES) {
    const match = rule.pattern.exec(text)
    if (!match) continue
    const suffix = text.slice(match[0].length).trim()
    return suffix ? `${rule.label} ${suffix}` : rule.label
  }

  // 无法识别的命名原样返回，不强行猜测
  return text
}

/** 设备状态词 → 中文 */
const STATE_LABELS: Readonly<Record<string, string>> = {
  up: '已恢复',
  down: '已断开',
  full: '正常',
  idle: '空闲',
  active: '活动',
  inactive: '未激活',
  established: '已建立',
  administratively: '被管理员手动',
}

/**
 * 把状态词转成中文，无法识别时原样返回。
 */
export function humanizeState(raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  return STATE_LABELS[text.toLowerCase()] ?? text
}

/** 告警分类 → 中文。对应后端 normalizeCategory 的输出集合 */
const ALERT_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  connectivity: '网络连通性',
  performance: '性能',
  security: '安全',
  configuration: '配置',
  hardware: '硬件',
  environment: '机房环境',
  other: '其他',
}

/**
 * 把告警分类转成中文。
 * 后端 `normalizeCategory` 只做小写归一，未知值原样透传，故此处也保持原样兜底。
 */
export function humanizeAlertCategory(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return '未分类'
  return ALERT_CATEGORY_LABELS[text] ?? text
}

/**
 * 设施分类 → 可嵌入句子的领域描述，用于兜底翻译。
 *
 * 同时收录两套值域：日志的 facility（system/interface/...）与
 * 告警的 category（connectivity/performance/...）。二者共用本函数，
 * 缺一套会让对应模块的兜底文案退化成笼统的「设备」。
 */
const FACILITY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // 日志 facility
  system: '系统运行',
  interface: '网络接口',
  security: '安全',
  routing: '路由',
  switching: '交换',
  snmp: 'SNMP 监控',
  ssh: '远程登录',
  hardware: '硬件',
  environment: '机房环境',
  other: '设备',
  // 告警 category（后端 normalizeCategory 的输出）
  connectivity: '网络连通性',
  performance: '性能',
  configuration: '配置',
}

/** 取设施的领域描述，未知时回退为「设备」 */
export function describeFacility(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return '设备'
  return FACILITY_DESCRIPTIONS[text] ?? '设备'
}

/** 日志级别 → 中文描述，用于兜底翻译 */
const LEVEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  debug: '调试',
  info: '普通',
  notice: '提示',
  warning: '警告',
  warn: '警告',
  error: '错误',
  err: '错误',
  critical: '严重',
  fatal: '严重',
}

/** 取级别的中文描述，未知时回退为「普通」 */
export function describeLevel(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return '普通'
  return LEVEL_DESCRIPTIONS[text] ?? '普通'
}

/**
 * 由原始级别推导 UI 语气，仅用于兜底路径。
 * 命中具体规则时以规则自身声明的 tone 为准 —— 规则更清楚该事件对用户的实际影响。
 */
export function toneFromLevel(raw: string | undefined | null): PlainTone {
  switch (String(raw ?? '').trim().toLowerCase()) {
    case 'critical':
    case 'fatal':
      return 'critical'
    case 'error':
    case 'err':
    case 'warning':
    case 'warn':
      return 'warning'
    default:
      return 'info'
  }
}
