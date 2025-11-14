// 审计日志类型
export type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'import'
  | 'config_change'

// 审计日志记录
export interface AuditLog {
  id: string
  userId: string
  username: string
  action: AuditAction
  resource: string // 操作的资源类型（user、device、setting等）
  resourceId?: string // 资源ID
  details: string // 操作详情
  ipAddress: string
  userAgent: string
  status: 'success' | 'failed'
  errorMessage?: string
  createdAt: string
}

// 审计日志列表响应
export interface AuditLogListResponse {
  logs: AuditLog[]
  totalCount: number
  page: number
  pageSize: number
}

// 审计日志查询参数
export interface AuditLogQueryParams {
  page?: number
  pageSize?: number
  userId?: string
  action?: AuditAction
  resource?: string
  status?: 'success' | 'failed'
  startDate?: string
  endDate?: string
  keyword?: string
}

// 审计统计
export interface AuditStats {
  totalLogs: number
  todayLogs: number
  successRate: number
  topUsers: Array<{ username: string; count: number }>
  topActions: Array<{ action: AuditAction; count: number }>
}
