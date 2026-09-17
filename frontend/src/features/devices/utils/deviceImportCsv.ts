import type { CLIProtocol, DeviceImportData, DeviceType, DeviceVendor, SNMPVersion } from '../types'

/** 批量导入 CSV 一行经列映射后得到的原始文本值（尚未归一化）。 */
export type RawImportRow = Partial<Record<ImportFieldKey, string>>

export type ImportFieldKey =
  | 'name'
  | 'ip'
  | 'device_type'
  | 'vendor'
  | 'location'
  | 'description'
  | 'snmp_version'
  | 'snmp_port'
  | 'snmp_community'
  | 'cli_protocol'
  | 'ssh_username'
  | 'ssh_password'
  | 'ssh_port'
  | 'telnet_username'
  | 'telnet_password'
  | 'telnet_port'
  | 'enable_password'

export interface ImportFieldDefinition {
  key: ImportFieldKey
  /** 模板列头，同时也是字段映射下拉里的中文名 */
  label: string
  required: boolean
  /** 模板示例行的值 */
  example: string
  /** 列头识别别名（大小写、空格、下划线不敏感） */
  aliases: string[]
}

export const IMPORT_FIELD_DEFINITIONS: ImportFieldDefinition[] = [
  { key: 'name', label: '设备名称', required: true, example: '模板设备', aliases: ['name', '名称', 'hostname'] },
  { key: 'ip', label: 'IP地址', required: true, example: '192.168.1.1', aliases: ['ip', 'ip_address', 'ipaddress', 'ip 地址', '管理IP'] },
  { key: 'device_type', label: '设备类型', required: true, example: 'switch', aliases: ['device_type', 'devicetype', 'type', '类型'] },
  { key: 'vendor', label: '厂商', required: false, example: 'huawei', aliases: ['vendor', '厂牌', '品牌', '设备厂商'] },
  { key: 'location', label: '位置', required: false, example: '模板位置', aliases: ['location', '位置信息', '机房'] },
  { key: 'description', label: '描述', required: false, example: '模板数据请按实际设备修改', aliases: ['description', 'desc', '备注', '设备描述'] },
  { key: 'snmp_version', label: 'SNMP版本', required: false, example: 'v2c', aliases: ['snmp_version', 'snmpversion'] },
  { key: 'snmp_port', label: 'SNMP端口', required: false, example: '161', aliases: ['snmp_port', 'snmpport'] },
  { key: 'snmp_community', label: 'SNMP团体字符串', required: false, example: 'public', aliases: ['snmp_community', 'snmpcommunity', 'community', 'snmp团体', '团体字符串', '团体名'] },
  { key: 'cli_protocol', label: 'CLI协议', required: false, example: 'ssh', aliases: ['cli_protocol', 'cliprotocol', 'protocol', '协议', '登录协议'] },
  { key: 'ssh_username', label: 'SSH用户名', required: false, example: 'admin', aliases: ['ssh_username', 'sshusername', 'ssh_user', 'sshuser', 'ssh 用户名'] },
  { key: 'ssh_password', label: 'SSH密码', required: false, example: '', aliases: ['ssh_password', 'sshpassword', 'ssh 密码'] },
  { key: 'ssh_port', label: 'SSH端口', required: false, example: '22', aliases: ['ssh_port', 'sshport'] },
  { key: 'telnet_username', label: 'Telnet用户名', required: false, example: '', aliases: ['telnet_username', 'telnetusername', 'telnet_user', 'telnetuser'] },
  { key: 'telnet_password', label: 'Telnet密码', required: false, example: '', aliases: ['telnet_password', 'telnetpassword'] },
  { key: 'telnet_port', label: 'Telnet端口', required: false, example: '23', aliases: ['telnet_port', 'telnetport'] },
  { key: 'enable_password', label: 'Enable密码', required: false, example: '', aliases: ['enable_password', 'enablepassword', '特权密码', 'enable 密码'] },
]

export const IMPORT_TEMPLATE_HEADERS = IMPORT_FIELD_DEFINITIONS.map((field) => field.label)
export const IMPORT_TEMPLATE_EXAMPLE_ROW = IMPORT_FIELD_DEFINITIONS.map((field) => field.example)

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/[\s_\-（）()]/g, '')

/**
 * 列头识别：精确匹配优先（对标签与别名逐一比对），全部落空后才退回包含匹配。
 * 旧实现只做包含匹配且按定义顺序取首个命中，"description" 含 "ip" 会被判成 IP 地址，
 * "SNMP版本" 含 "snmp" 会被判成团体字符串。
 */
export const detectImportField = (header: string): ImportFieldKey | '' => {
  const normalized = normalizeHeader(header)
  if (!normalized) return ''

  for (const field of IMPORT_FIELD_DEFINITIONS) {
    const candidates = [field.label, ...field.aliases].map(normalizeHeader)
    if (candidates.includes(normalized)) return field.key
  }

  // 包含匹配按候选词长度降序，让更具体的词（snmp团体字符串）先于泛词（snmp）命中
  const partials = IMPORT_FIELD_DEFINITIONS.flatMap((field) =>
    [field.label, ...field.aliases]
      .map(normalizeHeader)
      .filter((candidate) => candidate.length >= 4)
      .map((candidate) => ({ candidate, key: field.key })),
  ).sort((a, b) => b.candidate.length - a.candidate.length)

  const hit = partials.find(({ candidate }) => normalized.includes(candidate))
  return hit ? hit.key : ''
}

/**
 * 按字节解码 CSV：优先 UTF-8（BOM 或严格校验通过），失败则按 GBK。
 * 中文 Windows 上 Excel 把带 BOM 的模板"另存为 CSV"会丢掉 BOM 并改用 ANSI(GBK)，
 * 直接按 UTF-8 读会把中文列头读成乱码，导致所有列都识别不到。
 */
export const decodeCsvBytes = (bytes: Uint8Array): string => {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const body = hasBom ? bytes.subarray(3) : bytes
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    try {
      return new TextDecoder('gbk').decode(body)
    } catch {
      return new TextDecoder('utf-8').decode(body)
    }
  }
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** RFC 4180 风格解析：支持引号包裹的逗号/换行与 "" 转义。 */
export const parseCsv = (content: string): ParsedCsv => {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i += 1
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  const nonEmpty = records
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ''))

  if (nonEmpty.length <= 1) {
    throw new Error('CSV 内容为空或缺少数据行')
  }

  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) }
}

const DEVICE_TYPE_ALIASES: Record<string, DeviceType> = {
  switch: 'switch',
  交换机: 'switch',
  router: 'router',
  路由器: 'router',
  firewall: 'firewall',
  防火墙: 'firewall',
  wirelessap: 'wireless_ap',
  accesspoint: 'wireless_ap',
  ap: 'wireless_ap',
  无线ap: 'wireless_ap',
  无线接入点: 'wireless_ap',
}

const VENDOR_ALIASES: Record<string, DeviceVendor> = {
  huawei: 'huawei',
  华为: 'huawei',
  h3c: 'h3c',
  华三: 'h3c',
  新华三: 'h3c',
  other: 'other',
  其他: 'other',
  未知: 'other',
}

const normalizeToken = (value: string): string => value.toLowerCase().replace(/[\s_\-]/g, '')

export const normalizeImportDeviceType = (value?: string): DeviceType =>
  DEVICE_TYPE_ALIASES[normalizeToken(value ?? '')] ?? 'switch'

export const normalizeImportVendor = (value?: string): DeviceVendor =>
  VENDOR_ALIASES[normalizeToken(value ?? '')] ?? 'other'

const normalizeSnmpVersion = (value?: string): SNMPVersion | undefined => {
  const token = normalizeToken(value ?? '')
  if (!token) return undefined
  if (token === 'v3' || token === '3') return 'v3'
  return 'v2c'
}

const parsePort = (value?: string): number | undefined => {
  const port = Number.parseInt((value ?? '').trim(), 10)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
}

const trimOrUndefined = (value?: string): string | undefined => {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : undefined
}

const resolveCliProtocol = (row: RawImportRow): CLIProtocol => {
  const explicit = normalizeToken(row.cli_protocol ?? '')
  if (explicit === 'ssh' || explicit === 'telnet' || explicit === 'none') return explicit
  if (trimOrUndefined(row.ssh_username)) return 'ssh'
  if (trimOrUndefined(row.telnet_username)) return 'telnet'
  return 'none'
}

/** 把一行原始文本归一化为提交给后端的导入数据。 */
export const buildImportDevice = (row: RawImportRow): DeviceImportData => ({
  name: (row.name ?? '').trim(),
  ip: (row.ip ?? '').trim(),
  device_type: normalizeImportDeviceType(row.device_type),
  vendor: normalizeImportVendor(row.vendor),
  location: trimOrUndefined(row.location),
  description: trimOrUndefined(row.description),
  snmp_version: normalizeSnmpVersion(row.snmp_version),
  snmp_port: parsePort(row.snmp_port),
  snmp_community: trimOrUndefined(row.snmp_community),
  cli_protocol: resolveCliProtocol(row),
  ssh_username: trimOrUndefined(row.ssh_username),
  // 密码不做 trim：首尾空格可能是密码的一部分
  ssh_password: row.ssh_password || undefined,
  ssh_port: parsePort(row.ssh_port),
  telnet_username: trimOrUndefined(row.telnet_username),
  telnet_password: row.telnet_password || undefined,
  telnet_port: parsePort(row.telnet_port),
  enable_password: row.enable_password || undefined,
})
