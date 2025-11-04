// 网络统计指标类型
export interface NetworkStat {
  title: string
  value: string
  change: string
  trend: 'up' | 'down'
  icon: string
  color: string
  data: number[]
}

// 设备状态类型
export type DeviceHealthStatus = 'healthy' | 'warning' | 'critical'

// 设备监控状态接口
export interface DeviceMonitoringStatus {
  name: string
  status: DeviceHealthStatus
  cpu: number
  memory: number
  uptime: string
  alerts?: number
  lastSeen?: string
}

// 网络流量接口
export interface NetworkTraffic {
  inbound: {
    value: string
    percentage: number
    current?: number
    peak?: number
    data?: number[]
  }
  outbound: {
    value: string
    percentage: number
    current?: number
    peak?: number
    data?: number[]
  }
  packetLoss: {
    value: string
    percentage: number
  }
  peakTime?: string
}

// 告警汇总接口
export interface AlertSummary {
  critical: number
  warning: number
  info: number
  recent?: Array<{
    id: number
    message: string
    severity: string
    time: string
  }>
  trends?: {
    up: number
    down: number
    stable: number
  }
}

// 监控数据汇总接口
export interface MonitoringData {
  networkStats: NetworkStat[]
  deviceStatus: DeviceMonitoringStatus[]
  networkTraffic: NetworkTraffic
  alertSummary: AlertSummary
  lastUpdate: Date | string
  totalAlerts?: number
}

// 监控配置接口
export interface MonitoringConfig {
  autoRefresh: boolean
  refreshInterval: number
}