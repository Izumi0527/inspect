import { LucideIcon } from 'lucide-react'

// 统计卡片接口
export interface DashboardStat {
  title: string
  value: string
  change: string
  iconName: string
  iconColor: string
  color: string
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
export interface NetworkOverviewItem {
  title: string
  description: string
  count: number
  iconName: string
  gradient: string
}

// Dashboard数据汇总接口
export interface DashboardData {
  stats: DashboardStat[]
  recentAlerts: RecentAlert[]
  networkOverview: NetworkOverviewItem[]
  lastUpdated: Date
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