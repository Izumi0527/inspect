// Dashboard模块的统一导出入口
export { DashboardView } from './components/DashboardView'
export { Sidebar } from './components/Sidebar'
export { DashboardHeader } from './components/DashboardHeader'
export { StatsGrid } from './components/StatsGrid'
export { RecentAlertsCard } from './components/RecentAlertsCard'
export { QuickActionsCard } from './components/QuickActionsCard'
export { NetworkOverviewCard } from './components/NetworkOverviewCard'

export { 
  useDashboardData, 
  useDashboardConfig, 
  useDashboardAutoRefresh,
  useQuickActions,
  useDeviceSearch,
  useAlertAnalysis,
  useAlertSeverityStyles 
} from './hooks/useDashboard'

export {
  fetchDashboardData,
  fetchRecentAlerts,
  fetchNetworkOverview,
  performDeviceScan,
  generateReport,
  searchDevices
} from './api/dashboard.api'

export type { 
  DashboardStat, 
  NavigationItem, 
  RecentAlert, 
  AlertSeverity, 
  QuickAction, 
  NetworkOverviewItem, 
  DashboardData, 
  DashboardConfig, 
  UserInfo 
} from './types'