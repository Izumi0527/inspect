import {
  SystemConfig,
  User,
  Role,
  Permission,
  AuditLog,
  Backup,
  SystemMetrics,
  NotificationConfig,
  SecurityConfig,
  SystemInfo,
  License,
  SettingsGroup,
  SystemHealth,
  UserPaginatedResponse,
  UserBulkOperation,
  UserBulkImport
} from '../types'
import { API_PREFIX, getApiOrigin, httpClient } from '@/lib/api-client'

type ConfigValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null

type AuditLogExportFilters = Record<string, string | number | boolean | Array<string | number>>

interface AuditLogExportParams {
  format: 'csv' | 'excel' | 'json'
  startDate: string
  endDate: string
  filters?: AuditLogExportFilters
}

// 系统配置API
// 注意: 后端实际路由使用 /settings/general 而不是 /settings/system
export const systemConfigApi = {
  // 获取配置分组
  getConfigGroups: () =>
    httpClient.get<SettingsGroup[]>('/settings/general/categories'),

  // 获取所有配置
  getConfigs: (category?: string) => {
    const params = category ? `?category=${category}` : ''
    return httpClient.get<SystemConfig[]>(`/settings/general/settings${params}`)
  },

  // 获取单个配置
  getConfig: (key: string) =>
    httpClient.get<SystemConfig>(`/settings/general/settings/${key}`),

  // 更新配置
  updateConfig: (key: string, value: ConfigValue) =>
    httpClient.put<SystemConfig>(`/settings/general/settings/${key}`, { key, value }),

  // 批量更新配置
  updateConfigs: (configs: Array<{ key: string; value: ConfigValue }>) =>
    httpClient.post<{ message: string; results: Record<string, boolean> }>(
      '/settings/general/settings/bulk',
      { settings: Object.fromEntries(configs.map(c => [c.key, c.value])) }
    ),

  // 重置配置到默认值
  resetConfig: (key: string) =>
    httpClient.post<{ message: string; key: string }>(`/settings/general/settings/${key}/reset`),
}

// 用户管理API
export const userManagementApi = {
  // 获取用户列表
  getUsers: async (params?: {
    page?: number
    pageSize?: number
    role?: string
    status?: string
    search?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.pageSize) searchParams.set('page_size', params.pageSize.toString())
    if (params?.role) searchParams.set('role', params.role)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.search) searchParams.set('search', params.search)

    return httpClient.get<UserPaginatedResponse>(`/settings/users?${searchParams}`)
  },

  // 获取用户详情
  getUser: (id: string) =>
    httpClient.get<User>(`/settings/users/${id}`),

  // 创建用户
  createUser: (data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) =>
    httpClient.post<User>('/settings/users', data),

  // 更新用户
  updateUser: (id: string, data: Partial<User>) =>
    httpClient.put<User>(`/settings/users/${id}`, data),

  // 删除用户
  deleteUser: (id: string) =>
    httpClient.delete<void>(`/settings/users/${id}`),

  // 重置用户密码 - 后端端点: POST /settings/users/:id/change-password
  resetPassword: async (id: string, newPassword: string) => {
    await httpClient.post<void>(`/settings/users/${id}/change-password`, { new_password: newPassword })
  },

  // 锁定/解锁用户 - 后端端点: POST /settings/users/:id/lock | /unlock
  toggleUserLock: async (id: string, locked: boolean) => {
    if (locked) {
      await httpClient.post<void>(`/settings/users/${id}/lock`, {})
    } else {
      await httpClient.post<void>(`/settings/users/${id}/unlock`, {})
    }
    return httpClient.get<User>(`/settings/users/${id}`)
  },

  // 获取用户权限 - 后端端点: GET /settings/users/:id/permissions
  getUserPermissions: (id: string) =>
    httpClient.get<Permission[]>(`/settings/users/${id}/permissions`),

  // 批量操作用户 - 后端实际路由: POST /settings/users/batch
  bulkOperation: (operation: UserBulkOperation) =>
    httpClient.post<void>('/settings/users/batch', operation),

  // 批量导入用户 - 后端端点: POST /settings/users/import（支持 JSON 或文件）
  importUsers: (importData: UserBulkImport) =>
    httpClient.post('/settings/users/import', importData),
}

// 角色管理API
export const roleManagementApi = {
  // 获取角色列表 - 后端端点: GET /settings/roles
  getRoles: () => httpClient.get<Role[]>('/settings/roles'),

  // 获取角色详情 - 后端端点: GET /settings/roles/:id
  getRole: (id: string) => httpClient.get<Role>(`/settings/roles/${id}`),

  // 创建角色 - 后端端点: POST /settings/roles
  createRole: (data: Omit<Role, 'id' | 'userCount' | 'createdAt' | 'updatedAt'>) =>
    httpClient.post<Role>('/settings/roles', data),

  // 更新角色 - 后端端点: PUT /settings/roles/:id
  updateRole: (id: string, data: Partial<Role>) =>
    httpClient.put<Role>(`/settings/roles/${id}`, data),

  // 删除角色 - 后端端点: DELETE /settings/roles/:id
  deleteRole: (id: string) => httpClient.delete<void>(`/settings/roles/${id}`),

  // 获取所有权限 - 后端端点: GET /settings/permissions
  getPermissions: () => httpClient.get<Permission[]>('/settings/permissions'),

  // 分配权限给角色（全量覆盖） - 后端端点: POST /settings/roles/:id/permissions
  assignPermissions: async (roleId: string, permissionIds: string[]) => {
    await httpClient.post(`/settings/roles/${roleId}/permissions`, { permissionIds })
    return httpClient.get<Role>(`/settings/roles/${roleId}`)
  },
}

// 审计日志API
export const auditLogApi = {
  // 获取审计日志
  getLogs: async (params?: {
    page?: number
    pageSize?: number
    userId?: string
    action?: string
    status?: string
    search?: string
    startDate?: string
    endDate?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.pageSize) searchParams.set('page_size', params.pageSize.toString())
    if (params?.userId) searchParams.set('user_id', params.userId)
    if (params?.action) searchParams.set('action', params.action)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.startDate) searchParams.set('start_date', params.startDate)
    if (params?.endDate) searchParams.set('end_date', params.endDate)

    return httpClient.get<{
      items: AuditLog[]
      total: number
      page: number
      pageSize: number
    }>(`/settings/audit/logs?${searchParams}`)
  },

  // 获取审计日志详情
  getLog: (id: string) =>
    httpClient.get<AuditLog>(`/settings/audit/logs/${id}`),

  // 导出审计日志
  exportLogs: async (params: AuditLogExportParams): Promise<Blob> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authData') : null
    const authData = token ? JSON.parse(token) : null

    const response = await fetch(`${getApiOrigin()}${API_PREFIX}/settings/audit/logs/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authData?.token && { 'Authorization': `Bearer ${authData.token}` })
      },
      body: JSON.stringify(params),
    })
    return response.blob()
  },

  // 清理旧日志 - 后端实际路由: DELETE /settings/audit/cleanup
  cleanupLogs: (_beforeDate: string) =>
    httpClient.delete<{ deletedCount: number }>('/settings/audit/cleanup'),
}

// 备份恢复API
// 注意: 后端实际路由是 /settings/backup/config 和 /settings/backup/stats
export const backupApi = {
  // 获取备份配置 - 后端实际路由: /settings/backup/config
  getBackups: () =>
    httpClient.get<Backup[]>('/settings/backup/config'),

  // 获取备份统计 - 后端实际路由: /settings/backup/stats
  getBackupStats: () =>
    httpClient.get<{ total: number; size: string }>('/settings/backup/stats'),

  // 获取备份详情 - 后端暂不支持
  getBackup: (_id: string) =>
    Promise.resolve(null as Backup | null),

  // 创建备份 - 后端暂不支持
  createBackup: (data: {
    name: string
    description?: string
    type: 'full' | 'incremental' | 'differential'
    includes: Array<{
      type: 'database' | 'config' | 'logs' | 'files'
      name: string
    }>
  }) =>
    Promise.resolve({
      id: Date.now().toString(),
      name: data.name,
      description: data.description,
      type: data.type,
      status: 'creating',
      size: 0,
      filePath: '',
      checksum: '',
      includes: data.includes.map(i => ({ ...i, size: 0 })),
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    } as Backup),

  // 删除备份 - 后端暂不支持
  deleteBackup: (_id: string) =>
    Promise.resolve(),

  // 下载备份 - 后端暂不支持
  downloadBackup: async (_id: string): Promise<Blob> => {
    return new Blob(['后端暂不支持此功能'], { type: 'text/plain' })
  },

  // 恢复备份 - 后端暂不支持
  restoreBackup: (_id: string, _options?: {
    overwrite?: boolean
    validateOnly?: boolean
  }) =>
    Promise.resolve({ success: false, message: '后端暂不支持此功能' }),

  // 验证备份 - 后端暂不支持
  validateBackup: (_id: string) =>
    Promise.resolve({ valid: false, issues: ['后端暂不支持此功能'] }),
}

// 系统监控API
// 注意: 后端路由使用 /settings/general 和 /settings/monitoring
export const systemMonitoringApi = {
  // 获取系统指标 - 使用 /settings/monitoring/current
  getMetrics: (timeRange?: {
    startTime: string
    endTime: string
    interval?: '1m' | '5m' | '15m' | '1h' | '1d'
  }) => {
    // 后端实际路由: /settings/monitoring/current 或 /settings/monitoring/history
    if (timeRange) {
      const params = `?${new URLSearchParams({
        start_time: timeRange.startTime,
        end_time: timeRange.endTime,
      })}`
      return httpClient.get<SystemMetrics[]>(`/settings/monitoring/history${params}`)
    }
    return httpClient.get<SystemMetrics[]>('/settings/monitoring/current')
  },

  // 获取系统健康状态 - 后端实际路由: /settings/health
  getHealth: () =>
    httpClient.get<SystemHealth>('/settings/health'),

  // 获取系统信息 - 后端实际路由: /settings/general/info
  getSystemInfo: () =>
    httpClient.get<SystemInfo>('/settings/general/info'),

  // 重启系统服务 - 后端暂不支持此功能
  restartService: (_serviceName: string) =>
    Promise.resolve({ success: false, message: '后端暂不支持此功能' }),

  // 清理系统缓存 - 后端暂不支持此功能
  clearCache: (_type?: 'all' | 'session' | 'data' | 'reports') =>
    Promise.resolve({ success: false, message: '后端暂不支持此功能' }),
}

// 通知配置API
// 注意: 后端实际路由使用 /settings/notifications/
export const notificationApi = {
  // 获取通知配置列表 - 后端实际路由: GET /settings/notifications/
  getConfigs: () =>
    httpClient.get<NotificationConfig[]>('/settings/notifications/'),

  // 获取通知统计 - 后端实际路由: GET /settings/notifications/stats
  getStats: () =>
    httpClient.get<{ total: number }>('/settings/notifications/stats'),

  // 获取通知配置详情 - 后端暂不支持
  getConfig: (_id: string) =>
    Promise.resolve(null as NotificationConfig | null),

  // 创建通知配置 - 后端暂不支持
  createConfig: (data: Omit<NotificationConfig, 'id'>) =>
    Promise.resolve({ id: '', ...data } as NotificationConfig),

  // 更新通知配置 - 后端暂不支持
  updateConfig: (_id: string, data: Partial<NotificationConfig>) =>
    Promise.resolve(data as NotificationConfig),

  // 删除通知配置 - 后端暂不支持
  deleteConfig: (_id: string) =>
    Promise.resolve(),

  // 测试邮件通知 - 后端实际路由: POST /settings/notifications/test-email
  testEmail: (recipient?: string) =>
    httpClient.post<{ success: boolean; message: string }>('/settings/notifications/test-email', { recipient }),

  // 测试短信通知 - 后端实际路由: POST /settings/notifications/test-sms
  testSms: (recipient?: string) =>
    httpClient.post<{ success: boolean; message: string }>('/settings/notifications/test-sms', { recipient }),

  // 测试Webhook - 后端实际路由: POST /settings/notifications/test-webhook
  testWebhook: (url?: string) =>
    httpClient.post<{ success: boolean; message: string }>('/settings/notifications/test-webhook', { url }),

  // 测试通知配置 (兼容旧接口)
  testConfig: (id: string, recipient?: string) =>
    httpClient.post<{ success: boolean; message: string }>('/settings/notifications/test-email', { recipient }),
}

// 安全设置API
// 注意: 后端实际路由使用 /settings/security/
export const securityApi = {
  // 获取安全设置 - 后端实际路由: GET /settings/security/
  getSecuritySettings: () =>
    httpClient.get<SecurityConfig>('/settings/security/'),

  // 获取安全统计 - 后端实际路由: GET /settings/security/stats
  getSecurityStats: () =>
    httpClient.get<{ sessions: number }>('/settings/security/stats'),

  // 获取活跃会话 - 后端实际路由: GET /settings/security/sessions
  getActiveSessions: () =>
    httpClient.get<unknown[]>('/settings/security/sessions'),

  // 更新安全设置 - 后端暂不支持 PUT
  updateSecuritySettings: (data: Partial<SecurityConfig>) =>
    Promise.resolve(data as SecurityConfig),
}

// 许可证API
// 注意: 后端仅支持获取许可证信息
export const licenseApi = {
  // 获取许可证信息
  getLicense: () =>
    httpClient.get<License>('/settings/license'),
}
