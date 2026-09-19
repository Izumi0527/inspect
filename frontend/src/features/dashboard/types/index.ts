import { LucideIcon } from 'lucide-react'

// 统计卡片接口
export interface DashboardStat {
  title: string
  value: string
  change: string
  iconName: string
  iconColor: string
  color: string
  unit?: string // 需要格式化的值的单位（例如，带宽使用 "bps"）
}

// 导航项接口
export interface NavigationItem {
  name: string
  icon: LucideIcon
  href: string
  active?: boolean
  badge?: string | number
}

// 告警级别类型
export type AlertSeverity = 'high' | 'medium' | 'low'

// 最近告警接口
export interface RecentAlert {
  id: number
  device: string
  message: string
  severity: AlertSeverity
  time: string
  category?: string
}

// 快速操作接口
export interface QuickAction {
  title: string
  icon: LucideIcon
  description?: string
  action: () => void
  colorScheme: {
    hover: string
    text: string
  }
}

// 网络概览项接口
export type NetworkOverviewStatus = 'healthy' | 'normal' | 'warning' | 'critical' | 'unknown'

export interface NetworkOverviewItem {
  title: string
  description: string
  count: number
  iconName: string
  gradient: string
  status: NetworkOverviewStatus
}

// 网络拓扑：节点 = 台账设备，链路 = LLDP 邻居关系
export type TopologyNodeStatus = 'online' | 'offline' | 'warning' | 'unknown'

// 采集端对设备 LLDP 可用性的判定：ok / SNMP 视图未放行 1.0.8802 / 设备未全局启用
export type TopologyLLDPStatus = 'ok' | 'mib_unreachable' | 'disabled'

export interface TopologyNode {
  id: number
  name: string
  ip: string
  // 用户填写的档案类型
  deviceType: string
  // SNMP 识别出的类型（可能缺失）；展示层优先取它
  detectedType?: string
  vendor: string
  model: string
  firmwareVersion: string
  status: TopologyNodeStatus
  // LLDP 看到但台账里没有的邻居数（终端、未纳管设备）
  unmanagedNeighbors: number
  // 缺失表示尚未采集出结论
  lldpStatus?: TopologyLLDPStatus
}

export interface TopologyLink {
  id: string
  source: number
  target: number
  sourcePort: string
  targetPort: string
  // false 表示只有 source 一侧看见了对端
  bidirectional: boolean
}

export interface NetworkTopology {
  nodes: TopologyNode[]
  links: TopologyLink[]
}

export type DashboardSectionKey =
  | 'stats'
  | 'statsDevices'
  | 'statsAlerts'
  | 'statsBandwidth'
  | 'statsInspections'
  | 'activeAlerts'
  | 'networkOverview'

export interface DashboardSectionStatus {
  ok: boolean
  message?: string
  limitedByPermission?: boolean
  requiredPermission?: string
}

export type DashboardSectionStates = Record<DashboardSectionKey, DashboardSectionStatus>

export interface DashboardPermissions {
  devices: boolean
  alerts: boolean
  monitoring: boolean
  inspections: boolean
}

// Dashboard数据汇总接口
export interface DashboardData {
  stats: DashboardStat[]
  // 实时告警：仅当前活跃（open/acknowledged）的告警
  activeAlerts: RecentAlert[]
  networkOverview: NetworkOverviewItem[]
  networkTopology: NetworkTopology
  lastUpdated: Date
  sections: DashboardSectionStates
  permissions: DashboardPermissions
}

// Dashboard配置接口
export interface DashboardConfig {
  sidebarOpen: boolean
  autoRefresh: boolean
  refreshInterval: number
}

// 用户信息接口
export interface UserInfo {
  name: string
  role: string
  avatar?: string
  permissions: string[]
}
