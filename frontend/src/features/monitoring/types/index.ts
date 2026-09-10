// 单台设备在一个时间桶内的 CPU/内存均值（0-100）
export interface DevicePerformanceValue {
  cpu: number
  memory: number
}

// 系统性能历史数据点（按设备区分：deviceName -> CPU/内存）
export interface SystemPerformanceDataPoint {
  timestamp: Date | string
  devices: Record<string, DevicePerformanceValue>
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

// 网络流量历史数据点（上行 = outbound、下行 = inbound）
export interface NetworkTrafficDataPoint {
  timestamp: Date | string
  inbound: number // Mbps
  outbound: number // Mbps
}

// 单台设备当前 UP 的物理接口（流量卡接口选择器的选项；Vlanif/LoopBack/NULL/Console 等逻辑口不返回）
export interface DeviceInterfaceOption {
  /** 采集内部名（if<ifIndex>），也是接口流量查询的 interface 参数 */
  name: string
  /** ifDescr 别名，缺省回退 name */
  label: string
  speedMbps?: number
}

// 单台设备（可选单接口）的上行/下行流量时序，来自 GET /monitoring/devices/:id/interface-traffic
export interface DeviceInterfaceTraffic {
  deviceId: number
  /** 实际采用的接口名；请求未指定时为列表首个物理口，无可选接口时为空字符串 */
  interface: string
  interfaces: DeviceInterfaceOption[]
  points: NetworkTrafficDataPoint[]
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
