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
 * 接口类型前缀 → 类型注解。
 *
 * 统一使用「以太口」而非「电口/光口」：GE 口既可接双绞线也可插光模块，
 * 仅凭端口名无法判定物理介质，标注「电口」会在光口场景下给出错误信息。
 *
 * 顺序敏感：长前缀必须排在短前缀之前。
 * 例如 TenGigabitEthernet 若排在 GigabitEthernet 之后，
 * 由于前者包含后者的子串，万兆口会被误注解为千兆口。
 * 同理 M-Ethernet（带外管理口）必须先于 Ethernet。
 */
const INTERFACE_TYPE_RULES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^(?:100GE|HundredGigE)/i, label: '100G 以太口' },
  { pattern: /^(?:40GE|FortyGigE)/i, label: '40G 以太口' },
  { pattern: /^(?:TenGigabitEthernet|TenGigE|XGigabitEthernet|XGE|10GE)/i, label: '万兆以太口' },
  { pattern: /^M-?(?:GigabitEthernet|Ethernet|Eth)/i, label: '带外管理口' },
  { pattern: /^(?:GigabitEthernet|GigE|GE)/i, label: '千兆以太口' },
  { pattern: /^(?:FastEthernet|FE)/i, label: '百兆以太口' },
  { pattern: /^(?:Eth-?Trunk|Port-?channel|Po)/i, label: '链路聚合口' },
  { pattern: /^Vlanif/i, label: 'VLAN 虚接口' },
  { pattern: /^Loopback/i, label: '环回口' },
  { pattern: /^Tunnel/i, label: '隧道口' },
  { pattern: /^NULL/i, label: '空接口' },
  { pattern: /^Ethernet/i, label: '以太口' },
]

/**
 * 为接口名附加类型注解，保留设备侧原始命名。
 *
 * 原始名必须原样保留 —— 运维需要拿它与 `display interface` 输出、拓扑图、
 * 巡检报告逐字对照，替换成中文描述会切断这条线索。
 *
 * @example humanizeInterfaceName('GigabitEthernet0/0/1') // 'GigabitEthernet0/0/1（千兆以太口）'
 * @example humanizeInterfaceName('Eth-Trunk1')           // 'Eth-Trunk1（链路聚合口）'
 * @example humanizeInterfaceName('Xyz9/9')               // 'Xyz9/9' —— 无法识别则不强行注解
 */
export function humanizeInterfaceName(raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''

  for (const rule of INTERFACE_TYPE_RULES) {
    if (!rule.pattern.test(text)) continue
    return `${text}（${rule.label}）`
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

/**
 * 华为 VRP 日志模块名 → 中文名。
 *
 * 对应 `%%01IFNET/4/IF_STATE_CHANGE(l)` 结构化头中的模块名，覆盖华为 S 系列
 * 交换机 logbuffer 的高频模块（模块命名参照 docs/vendor 下华为 S 系列产品
 * 文档的 MIB 章节）。未收录的模块不强行翻译，原样展示 —— 错误的模块名
 * 比陌生的模块名更具误导性。
 */
const VRP_MODULE_LABELS: Readonly<Record<string, string>> = {
  // 接口与链路
  IFNET: '接口管理',
  ERRDOWN: '错误关闭口',
  MSTP: '生成树协议',
  L2IF: '二层接口',
  L2IFPDT: '二层接口',
  TRUNK: '链路聚合',
  ETHTRUNK: '链路聚合',
  LLDP: '链路层发现',
  POE: '以太网供电',
  POEPDT: '以太网供电',
  ETHPORT: '以太网端口',
  // 二层交换
  VLAN: '虚拟局域网',
  L2: '二层交换',
  STACK: '设备堆叠',
  STACKM: '设备堆叠',
  CSS: '集群交换',
  IGSP: 'IGMP Snooping',
  MACLIMIT: 'MAC 地址限制',
  // 路由
  RM: '路由管理',
  IPV6RM: 'IPv6 路由管理',
  OSPF: 'OSPF 路由',
  BGP: 'BGP 路由',
  RIP: 'RIP 路由',
  ISIS: 'IS-IS 路由',
  ND: 'IPv6 邻居发现',
  PIM: '组播路由',
  IGMP: '组播管理',
  MLD: '组播侦听发现',
  // 安全与接入
  AAA: 'AAA 认证',
  AM: '地址管理',
  LINE: '用户线管理',
  ARPSPI: 'ARP 防攻击',
  DHCP: 'DHCP 服务',
  DHCPSNP: 'DHCP Snooping',
  IPSG: 'IP 源防护',
  PORTSEC: '端口安全',
  PKI: '公钥基础设施',
  SSL: 'SSL 安全',
  // 远程登录
  SSH: 'SSH 远程登录',
  SFTP: 'SFTP 文件传输',
  SCP: 'SCP 文件传输',
  TELNET: 'Telnet 远程登录',
  FTP: 'FTP 文件传输',
  TFTP: 'TFTP 文件传输',
  NETCONF: 'NETCONF 网管',
  // 网管与系统
  SNMP: 'SNMP 网管',
  SYSTEM: '系统运行',
  SHELL: '命令行接口',
  CONFIGURATION: '配置管理',
  VFS: '文件系统',
  OPS: '运维脚本',
  LICENSE: 'License 管理',
  UPDATE: '软件升级',
  PATCH: '补丁管理',
  RESTART: '系统重启',
  IC: '信息中心',
  SRM: '系统资源管理',
  DEV: '设备管理',
  ENV: '环境监控',
  NTP: 'NTP 时钟',
}

/**
 * 取华为 VRP 模块的中文名，未收录时返回 undefined（不强行翻译）。
 * 模块名大小写不敏感匹配，返回时保留词典中的规范写法。
 */
export function describeVRPModule(raw: string | undefined | null): string | undefined {
  const text = String(raw ?? '').trim().toUpperCase()
  if (!text) return undefined
  return VRP_MODULE_LABELS[text]
}
