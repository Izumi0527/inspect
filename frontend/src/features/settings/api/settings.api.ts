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
  LDAPConfig,
  SystemInfo,
  License,
  SettingsGroup,
  SystemHealth,
  UserPaginatedResponse,
  UserBulkOperation,
  UserBulkImport
} from '../types'
import { httpClient } from '@/lib/api-client'

type ConfigValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null

type AuditLogExportFilters = Record<string, string | number | boolean | Array<string | number>>

interface AuditLogExportParams {
  format: 'csv' | 'excel' | 'json'
  startDate: string
  endDate: string
  filters?: AuditLogExportFilters
}

// 系统配置API
export const systemConfigApi = {
  // 获取配置分组
  getConfigGroups: () =>
    httpClient.get<SettingsGroup[]>('/settings/system/categories'),

  // 获取所有配置
  getConfigs: (category?: string) => {
    const params = category ? `?category=${category}` : ''
    return httpClient.get<SystemConfig[]>(`/settings/system/settings${params}`)
  },

  // 获取单个配置
  getConfig: (key: string) =>
    httpClient.get<SystemConfig>(`/settings/system/settings/${key}`),

  // 更新配置
  updateConfig: (key: string, value: ConfigValue) =>
    httpClient.put<SystemConfig>(`/settings/system/settings/${key}`, { key, value }),

  // 批量更新配置
  updateConfigs: (configs: Array<{ key: string; value: ConfigValue }>) =>
    httpClient.post<{ message: string; results: Record<string, boolean> }>(
      '/settings/system/settings/bulk',
      { settings: Object.fromEntries(configs.map(c => [c.key, c.value])) }
    ),

  // 重置配置到默认值
  resetConfig: (key: string) =>
    httpClient.post<{ message: string; key: string }>(`/settings/system/settings/${key}/reset`),

  // 导出配置
  exportConfigs: async (category?: string): Promise<Blob> => {
    const params = category ? `?category=${category}` : ''
    const token = typeof window !== 'undefined' ? localStorage.getItem('authData') : null
    const authData = token ? JSON.parse(token) : null

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/settings/system/export${params}`, {
      headers: authData?.token ? { 'Authorization': `Bearer ${authData.token}` } : {}
    })
    return response.blob()
  },

  // 导入配置
  importConfigs: async (file: File) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authData') : null
    const authData = token ? JSON.parse(token) : null

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/settings/system/import`, {
      method: 'POST',
      headers: authData?.token ? { 'Authorization': `Bearer ${authData.token}` } : {},
      body: formData,
    })
    return response.json()
  },
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

  // 重置用户密码
  resetPassword: (id: string, newPassword: string) =>
    httpClient.post<void>(`/settings/users/${id}/reset-password`, { password: newPassword }),

  // 锁定/解锁用户
  toggleUserLock: (id: string, locked: boolean) =>
    httpClient.post<User>(`/settings/users/${id}/lock`, { locked }),

  // 获取用户权限
  getUserPermissions: (id: string) =>
    httpClient.get<Permission[]>(`/settings/users/${id}/permissions`),

  // 批量操作用户
  bulkOperation: (operation: UserBulkOperation) =>
    httpClient.post<void>('/settings/users/bulk-operation', operation),

  // 批量导入用户
  importUsers: (importData: UserBulkImport) =>
    httpClient.post<void>('/settings/users/import', importData),
}

// 角色管理API
export const roleManagementApi = {
  // 获取角色列表
  getRoles: () =>
    httpClient.get<Role[]>('/settings/roles'),

  // 获取角色详情
  getRole: (id: string) =>
    httpClient.get<Role>(`/settings/roles/${id}`),

  // 创建角色
  createRole: (data: Omit<Role, 'id' | 'userCount' | 'createdAt' | 'updatedAt'>) =>
    httpClient.post<Role>('/settings/roles', data),

  // 更新角色
  updateRole: (id: string, data: Partial<Role>) =>
    httpClient.put<Role>(`/settings/roles/${id}`, data),

  // 删除角色
  deleteRole: (id: string) =>
    httpClient.delete<void>(`/settings/roles/${id}`),

  // 获取所有权限
  getPermissions: () =>
    httpClient.get<Permission[]>('/settings/permissions'),

  // 分配权限给角色
  assignPermissions: (roleId: string, permissionIds: string[]) =>
    httpClient.put<Role>(`/settings/roles/${roleId}/permissions`, { permissionIds }),
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

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/settings/audit/logs/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authData?.token && { 'Authorization': `Bearer ${authData.token}` })
      },
      body: JSON.stringify(params),
    })
    return response.blob()
  },

  // 清理旧日志
  cleanupLogs: (beforeDate: string) =>
    httpClient.delete<{ deletedCount: number }>('/settings/audit/logs/cleanup', { beforeDate }),
}

// 备份恢复API
export const backupApi = {
  // 获取备份列表
  getBackups: () =>
    httpClient.get<Backup[]>('/settings/backup'),

  // 获取备份详情
  getBackup: (id: string) =>
    httpClient.get<Backup>(`/settings/backup/${id}`),

  // 创建备份
  createBackup: (data: {
    name: string
    description?: string
    type: 'full' | 'incremental' | 'differential'
    includes: Array<{
      type: 'database' | 'config' | 'logs' | 'files'
      name: string
    }>
  }) =>
    httpClient.post<Backup>('/settings/backup', data),

  // 删除备份
  deleteBackup: (id: string) =>
    httpClient.delete<void>(`/settings/backup/${id}`),

  // 下载备份
  downloadBackup: async (id: string): Promise<Blob> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authData') : null
    const authData = token ? JSON.parse(token) : null

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/settings/backup/${id}/download`, {
      headers: authData?.token ? { 'Authorization': `Bearer ${authData.token}` } : {}
    })
    return response.blob()
  },

  // 恢复备份
  restoreBackup: (id: string, options?: {
    overwrite?: boolean
    validateOnly?: boolean
  }) =>
    httpClient.post<{ success: boolean; message: string }>(`/settings/backup/${id}/restore`, options || {}),

  // 验证备份
  validateBackup: (id: string) =>
    httpClient.post<{ valid: boolean; issues: string[] }>(`/settings/backup/${id}/validate`),
}

// 系统监控API
export const systemMonitoringApi = {
  // 获取系统指标
  getMetrics: (timeRange?: {
    startTime: string
    endTime: string
    interval?: '1m' | '5m' | '15m' | '1h' | '1d'
  }) => {
    const params = timeRange ? `?${new URLSearchParams({
      start_time: timeRange.startTime,
      end_time: timeRange.endTime,
      interval: timeRange.interval || '5m'
    })}` : ''
    return httpClient.get<SystemMetrics[]>(`/settings/monitoring/metrics${params}`)
  },

  // 获取系统健康状态
  getHealth: () =>
    httpClient.get<SystemHealth>('/settings/monitoring/health'),

  // 获取系统信息
  getSystemInfo: () =>
    httpClient.get<SystemInfo>('/settings/system/info'),

  // 重启系统服务
  restartService: (serviceName: string) =>
    httpClient.post<{ success: boolean; message: string }>(`/settings/system/services/${serviceName}/restart`),

  // 清理系统缓存
  clearCache: (type?: 'all' | 'session' | 'data' | 'reports') =>
    httpClient.post<{ success: boolean; message: string }>('/settings/system/cache/clear', { type: type || 'all' }),
}

// 通知配置API
export const notificationApi = {
  // 获取通知配置列表
  getConfigs: () =>
    httpClient.get<NotificationConfig[]>('/settings/notifications'),

  // 获取通知配置详情
  getConfig: (id: string) =>
    httpClient.get<NotificationConfig>(`/settings/notifications/${id}`),

  // 创建通知配置
  createConfig: (data: Omit<NotificationConfig, 'id'>) =>
    httpClient.post<NotificationConfig>('/settings/notifications', data),

  // 更新通知配置
  updateConfig: (id: string, data: Partial<NotificationConfig>) =>
    httpClient.put<NotificationConfig>(`/settings/notifications/${id}`, data),

  // 删除通知配置
  deleteConfig: (id: string) =>
    httpClient.delete<void>(`/settings/notifications/${id}`),

  // 测试通知配置
  testConfig: (id: string, recipient?: string) =>
    httpClient.post<{ success: boolean; message: string }>(`/settings/notifications/${id}/test`, { recipient }),
}

// 安全设置API
export const securityApi = {
  // 获取安全设置
  getSecuritySettings: () =>
    httpClient.get<SecurityConfig>('/settings/security'),

  // 更新安全设置
  updateSecuritySettings: (data: Partial<SecurityConfig>) =>
    httpClient.put<SecurityConfig>('/settings/security', data),

  // 获取LDAP配置
  getLDAPConfig: () =>
    httpClient.get<LDAPConfig>('/settings/security/ldap'),

  // 更新LDAP配置
  updateLDAPConfig: (data: Partial<LDAPConfig>) =>
    httpClient.put<LDAPConfig>('/settings/security/ldap', data),

  // 测试LDAP连接
  testLDAPConnection: (config: LDAPConfig) =>
    httpClient.post<{ success: boolean; message: string; users?: number }>('/settings/security/ldap/test', config),

  // 同步LDAP用户
  syncLDAPUsers: () =>
    httpClient.post<{ success: boolean; imported: number; updated: number }>('/settings/security/ldap/sync'),
}

// 许可证API
export const licenseApi = {
  // 获取许可证信息
  getLicense: () =>
    httpClient.get<License>('/settings/license'),

  // 更新许可证
  updateLicense: (licenseKey: string) =>
    httpClient.put<License>('/settings/license', { licenseKey }),

  // 验证许可证
  validateLicense: () =>
    httpClient.post<{ valid: boolean; message: string }>('/settings/license/validate'),
}
