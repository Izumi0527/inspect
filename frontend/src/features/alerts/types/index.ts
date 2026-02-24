
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
