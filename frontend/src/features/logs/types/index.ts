/**
 * 日志中心类型定义
 */

// 日志级别枚举
export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical'

// 日志设施枚举
export type LogFacility = 'system' | 'interface' | 'security' | 'routing' | 'switching' | 'snmp' | 'ssh' | 'other'

// 日志来源枚举
export type LogSource = 'syslog' | 'ssh' | 'snmp_trap' | 'manual'

// 日志记录
export interface DeviceLog {
  id: number
  device_id: number
  device_name?: string
  device_ip?: string
  level: LogLevel
  facility: LogFacility
  source: LogSource
  message: string
  raw_message?: string
  source_ip?: string
  source_process?: string
  log_timestamp: string
  collected_at: string
  created_at: string
}

// 日志解析规则
export interface LogParsingRule {
  id: number
  name: string
  pattern: string
  vendor: string
  device_type?: string
  level_mapping?: string
  facility_mapping?: string
  description?: string
  is_active: boolean
  priority: number
  created_at: string
  updated_at: string
}

// 日志统计
export interface LogStatistics {
  total_logs: number
  by_level: Record<string, number>
  by_facility: Record<string, number>
  by_device: Record<number, number>
  trends: Record<string, number>
  time_range_hours: number
}

// 日志查询参数
export interface LogQueryParams {
  device_id?: number
  level?: LogLevel
  facility?: LogFacility
  source?: LogSource
  search?: string
  start_time?: string
  end_time?: string
  page?: number
  page_size?: number
}

// 日志列表响应
export interface LogListResponse {
  logs: DeviceLog[]
  total: number
  page: number
  page_size: number
}

// 日志采集请求
export interface LogCollectionRequest {
  device_id: number
  log_type?: string
  max_entries?: number
}

// 日志采集响应
export interface LogCollectionResponse {
  success: boolean
  message: string
  collected_count: number
  device_id: number
}

// 日志过滤器状态
export interface LogFilters {
  searchQuery: string
  levelFilter: LogLevel | 'all'
  facilityFilter: LogFacility | 'all'
  sourceFilter: LogSource | 'all'
  deviceId?: number
  dateRange?: {
    start?: string
    end?: string
  }
}

// 日志级别配置
export const LOG_LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; bgColor: string }> = {
  debug: { label: '调试', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  info: { label: '信息', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  warning: { label: '警告', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  error: { label: '错误', color: 'text-red-600', bgColor: 'bg-red-100' },
  critical: { label: '严重', color: 'text-red-800', bgColor: 'bg-red-200' }
}

// 日志设施配置
export const LOG_FACILITY_CONFIG: Record<LogFacility, { label: string; icon: string }> = {
  system: { label: '系统', icon: 'Server' },
  interface: { label: '接口', icon: 'Network' },
  security: { label: '安全', icon: 'Shield' },
  routing: { label: '路由', icon: 'Route' },
  switching: { label: '交换', icon: 'Layers' },
  snmp: { label: 'SNMP', icon: 'Activity' },
  ssh: { label: 'SSH', icon: 'Terminal' },
  other: { label: '其他', icon: 'FileText' }
}

// 日志来源配置
export const LOG_SOURCE_CONFIG: Record<LogSource, { label: string }> = {
  syslog: { label: 'Syslog' },
  ssh: { label: 'SSH采集' },
  snmp_trap: { label: 'SNMP Trap' },
  manual: { label: '手动导入' }
}
