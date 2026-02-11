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
  icon?: string
  color?: string
}

// 监控数据汇总接口
export interface MonitoringDataV2 {
  // 系统性能历史
  systemPerformance: SystemPerformanceDataPoint[]
  // 温度历史
  temperatureHistory: TemperatureDataPoint[]
  // 设备状态分布
  deviceStatusDistribution: DeviceStatusDistribution
  // 整体可用性
  availability: AvailabilityData
  // 网络流量历史
  networkTrafficHistory: NetworkTrafficDataPoint[]
  // 统计卡片数据(6个)
  statsV2?: StatCardData[]
  // 实时告警列表
  realtimeAlerts?: Alert[]
  // 最后更新时间
  lastUpdate?: Date | string
}