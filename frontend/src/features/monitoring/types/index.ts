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

// 监控设备选项（设备筛选下拉，来自 GET /monitoring/devices）
export interface MonitoringDeviceOption {
  id: number
  name: string
  ipAddress: string
  status: string
  isMonitored: boolean
}

// 监控数据汇总接口
export interface MonitoringDataV2 {
  // 系统性能历史
  systemPerformance: SystemPerformanceDataPoint[]
  // 温度历史
  temperatureHistory: TemperatureDataPoint[]
  // 设备状态分布
  deviceStatusDistribution: DeviceStatusDistribution
  // 网络流量历史
  networkTrafficHistory: NetworkTrafficDataPoint[]
  // 统计卡片数据(6个)
  statsV2?: StatCardData[]
  // 实时告警列表
  realtimeAlerts?: Alert[]
  // 最后更新时间
  lastUpdate?: Date | string
}

// 监控分区键
export type MonitoringSectionKey =
  | 'stats'
  | 'systemPerformance'
  | 'temperature'
  | 'deviceStatus'
  | 'networkTraffic'
  | 'realtimeAlerts'

// 单个分区状态
export interface MonitoringSectionStatus {
  ok: boolean
  message?: string
  /** 该分区因权限限制被隐藏（不应计入 hasPartialFailure） */
  limitedByPermission?: boolean
  /** 访问该分区所需的最小权限（用于提示/诊断） */
  requiredPermission?: string
}

// 分区状态集合
export type MonitoringSectionStates = Record<MonitoringSectionKey, MonitoringSectionStatus>

// 监控页面数据包络结构（支持分区降级）
export interface MonitoringDataEnvelope {
  data: MonitoringDataV2
  sections: MonitoringSectionStates
  hasPartialFailure: boolean
  failedSections: MonitoringSectionKey[]
  lastUpdate: Date | string
  /** API 响应生成时间（区别于 lastUpdate 表示的最新数据点时间） */
  generatedAt?: Date | string
}
