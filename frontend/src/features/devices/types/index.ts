// 设备状态类型
export type DeviceStatus = 'online' | 'offline' | 'warning' | 'maintenance'

// 设备类型枚举
export type DeviceType = 'switch' | 'router' | 'firewall' | 'wireless_ap'

// CLI连接协议类型
export type CLIProtocol = 'ssh' | 'telnet' | 'none'

// SNMP版本类型
export type SNMPVersion = 'v2c' | 'v3'

// SNMPv3安全级别
export type SNMPv3SecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv'

// SNMPv3认证协议
export type SNMPv3AuthProtocol = 'MD5' | 'SHA' | 'SHA224' | 'SHA256' | 'SHA384' | 'SHA512'

// SNMPv3加密协议
export type SNMPv3PrivProtocol = 'DES' | '3DES' | 'AES128' | 'AES192' | 'AES256'

// SSH配置接口
export interface SSHConfig {
  username?: string
  password?: string
  port?: number
  use_key_auth?: boolean
  private_key?: string
}

// Telnet配置接口
export interface TelnetConfig {
  username?: string
  password?: string
  port?: number
  enable_password?: string
}

// SNMPv2c配置接口
export interface SNMPv2cConfig {
  community: string
  write_community?: string
}

// SNMPv3配置接口
export interface SNMPv3Config {
  username: string
  security_level: SNMPv3SecurityLevel
  auth_protocol?: SNMPv3AuthProtocol
  auth_password?: string
  priv_protocol?: SNMPv3PrivProtocol
  priv_password?: string
  context_name?: string
}

// SNMP配置接口
export interface SNMPConfig {
  version: SNMPVersion
  port?: number
  v2c_config?: SNMPv2cConfig
  v3_config?: SNMPv3Config
}

// 高级连接配置接口
export interface AdvancedConfig {
  timeout?: number
  retry?: number
}

// 设备数据接口
export interface Device {
  id: number
  name: string
  ip: string
  device_type: DeviceType
  status: DeviceStatus
  location: string
  last_seen: string
  uptime: string
  cpu_usage?: number
  memory_usage?: number
  network_traffic?: number
  alert_count?: number
  description?: string

  // 连接配置 - 新增字段
  cli_protocol?: CLIProtocol
  ssh_config?: SSHConfig
  telnet_config?: TelnetConfig
  snmp_config?: SNMPConfig
  advanced_config?: AdvancedConfig

  // 兼容性字段 - 保持向后兼容
  snmp_community?: string
  ssh_username?: string
  ssh_password?: string

  created_at?: string
  updated_at?: string
}

// 设备筛选接口
export interface DeviceFilters {
  searchQuery: string
  statusFilter: string
  typeFilter: string
  // API使用的属性名
  status?: string
  device_type?: string
  location?: string
  search?: string
  page?: number
  page_size?: number
}

// 设备统计接口
export interface DeviceSummary {
  total: number
  online: number
  offline: number
  warning: number
  totalAlerts: number
}

// 设备操作类型
export type DeviceAction = 'view' | 'edit' | 'delete' | 'power' | 'inspect' | 'clone' | 'export'

// 设备导入/导出相关类型
export interface DeviceImportData {
  name: string
  ip: string
  device_type: DeviceType
  location?: string
  description?: string

  // 连接配置 - 新增字段
  cli_protocol?: CLIProtocol
  ssh_config?: SSHConfig
  telnet_config?: TelnetConfig
  snmp_config?: SNMPConfig
  advanced_config?: AdvancedConfig

  // 兼容性字段 - 保持向后兼容
  snmp_community?: string
  ssh_username?: string
  ssh_password?: string
}

// CSV导入结果
export interface ImportResult {
  success: boolean
  imported_count: number
  skipped_count: number
  errors: Array<{
    row: number
    data: DeviceImportData
    error: string
  }>
  message: string
}

// 批量操作类型
export type BulkActionType =
  | 'start_inspection'
  | 'batch_config'
  | 'power_on'
  | 'power_off'
  | 'batch_delete'
  | 'batch_update'
  | 'batch_add_group'
  | 'batch_remove_group'

// 批量删除参数
export interface BulkDeleteParams {
  device_ids: number[]
  confirm_message?: string
}

// 批量更新参数
export interface BulkUpdateParams {
  device_ids: number[]
  updates: Partial<Device>
}

// 批量分组操作参数
export interface BulkGroupParams {
  device_ids: number[]
  group_id: number
  group_name?: string
}

// 批量添加设备参数
export interface BulkAddDevicesParams {
  devices: Omit<Device, 'id' | 'status' | 'last_seen' | 'uptime' | 'cpu_usage' | 'memory_usage' | 'network_traffic' | 'alert_count'>[]
  auto_detect?: boolean
  default_group_id?: number
}

export type BulkActionParams =
  | BulkDeleteParams
  | BulkUpdateParams
  | BulkGroupParams
  | BulkAddDevicesParams
  | Record<string, unknown>

// 批量操作接口
export interface BulkAction {
  type: BulkActionType
  params?: BulkActionParams
}

// 批量操作结果
export interface BulkOperationResult {
  success: boolean
  processed_count: number
  failed_count: number
  errors: Array<{
    device_id?: number
    device_name?: string
    error: string
  }>
  message: string
}
