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

export type DashboardSectionKey =
  | 'stats'
  | 'statsDevices'
  | 'statsAlerts'
  | 'statsBandwidth'
  | 'statsInspections'
  | 'recentAlerts'
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
  recentAlerts: RecentAlert[]
  networkOverview: NetworkOverviewItem[]
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
