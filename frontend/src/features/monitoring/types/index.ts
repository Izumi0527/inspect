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

// ==================== v1.1 新增类型定义 ====================

// 系统性能历史数据点
export interface SystemPerformanceDataPoint {
  timestamp: Date | string
  cpu: number // 0-100
  memory: number // 0-100
  network: number // Mbps
}

// 设备温度历史数据点
export interface TemperatureDataPoint {
  timestamp: Date | string
  devices: Record<string, number> // deviceName -> temperature (℃)
}

// 设备状态分布(聚合统计)
export interface DeviceStatusDistribution {
  healthy: number
  warning: number
  critical: number
  offline: number
}

// 整体可用性数据
export interface AvailabilityData {
  current: number // 当前可用性 0-100
  target: number // 目标可用性(如99.9)
  trend: 'up' | 'down' | 'stable'
  lastUpdate?: Date | string
}

// 网络流量历史数据点(堆叠面积图)
export interface NetworkTrafficDataPoint {
  timestamp: Date | string
  inbound: number // Mbps
  outbound: number // Mbps
}

// 单个告警
export interface Alert {
  id?: number
  severity: 'critical' | 'warning' | 'info'
  deviceName: string
  message: string
  time: string
  timestamp?: Date | string
}

// 统计卡片数据
export interface StatCardData {
  id: string // 用于图标映射
  title: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'stable'
  icon?: string // 已弃用,保留用于兼容性
  color?: string // 已弃用,保留用于兼容性
}

// v1.1 监控数据汇总接口(扩展v1)
export interface MonitoringDataV2 extends MonitoringData {
  // v2 新增的数据
  systemPerformance: SystemPerformanceDataPoint[]
  temperatureHistory: TemperatureDataPoint[]
  deviceStatusDistribution: DeviceStatusDistribution
  availability: AvailabilityData
  networkTrafficHistory: NetworkTrafficDataPoint[]

  // 扩展的统计卡片数据(6个)
  statsV2?: StatCardData[]

  // 实时告警列表
  realtimeAlerts?: Alert[]
}