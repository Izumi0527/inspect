
export type AlertSeverity = 'critical' | 'warning' | 'info'

export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export type AlertCategory = 'connectivity' | 'performance' | 'security' | 'configuration' | 'hardware' | 'other'

export interface Alert {
  id: string
  title: string
  description: string
  device: string
  severity: AlertSeverity
  status: AlertStatus
  timestamp: string
  assignee?: string
  category: string
  createdAt?: Date
  updatedAt?: Date
  resolution?: string
  acknowledgedAt?: Date
  resolvedAt?: Date
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface AlertFilters {
  searchQuery: string
  severityFilter: string
  statusFilter: string
  categoryFilter?: string
  deviceFilter?: string
  assigneeFilter?: string
}

// 告警中心默认视图：只看活跃告警。打开页面先看还没处理的，而不是被历史的已解决记录淹没；
// 它是「默认视图」而非「用户筛选」——判断是否已开启筛选时须把它排除（见 AlertsView）。
export const DEFAULT_ALERT_FILTERS: Readonly<AlertFilters> = Object.freeze({
  searchQuery: '',
  severityFilter: 'all',
  statusFilter: 'active',
})

export interface AlertStats {
  total: number
  critical: number
  warning: number
  info: number
  active: number
  acknowledged: number
  resolved: number
  byCategory?: Record<string, number>
  byDevice?: Record<string, number>
  trends?: Record<string, unknown>
}

export type AlertAction = 'acknowledge' | 'resolve' | 'assign' | 'delete' | 'comment'

export interface BulkAlertAction {
  alertIds: string[]
  action: AlertAction
  assignee?: string
  comment?: string
  params?: Record<string, unknown>
}

export interface AlertQueryParams {
  page?: number
  pageSize?: number
  severity?: AlertSeverity[]
  status?: AlertStatus[]
  search?: string
  sortBy?: 'timestamp' | 'severity' | 'status'
  sortOrder?: 'asc' | 'desc'
  deviceIds?: string[]
  startDate?: string
  endDate?: string
  category?: string[]
}

export interface AlertPaginatedResponse {
  alerts: Alert[]
  total: number
  page: number
  pageSize: number
  currentPage: number
  hasNext: boolean
  hasPrev: boolean
}
