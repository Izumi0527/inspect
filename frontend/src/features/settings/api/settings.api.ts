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
  SettingsApiResponse,
  UserPaginatedResponse,
  UserBulkOperation,
  UserBulkImport
} from '../types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

type ConfigValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null

type AuditLogExportFilters = Record<string, string | number | boolean | Array<string | number>>

interface AuditLogExportParams {
  format: 'csv' | 'excel' | 'json'
  startDate: string
  endDate: string
  filters?: AuditLogExportFilters
}

// 通用请求封装
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  const result: SettingsApiResponse<T> = await response.json()

  if (result.code !== 200) {
    throw new Error(result.message || 'API请求失败')
  }

  return result.data
}

// 系统配置API
export const systemConfigApi = {
  // 获取配置分组
  getConfigGroups: () =>
    apiRequest<SettingsGroup[]>('/api/settings/config/groups'),

  // 获取所有配置
  getConfigs: (category?: string) => {
    const params = category ? `?category=${category}` : ''
    return apiRequest<SystemConfig[]>(`/api/settings/config${params}`)
  },

  // 获取单个配置
  getConfig: (key: string) =>
    apiRequest<SystemConfig>(`/api/settings/config/${key}`),

  // 更新配置
  updateConfig: (key: string, value: ConfigValue) =>
    apiRequest<SystemConfig>(`/api/settings/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  // 批量更新配置
  updateConfigs: (configs: Array<{ key: string; value: ConfigValue }>) =>
    apiRequest<SystemConfig[]>('/api/settings/config/batch', {
      method: 'PUT',
      body: JSON.stringify({ configs }),
    }),

  // 重置配置到默认值
  resetConfig: (key: string) =>
    apiRequest<SystemConfig>(`/api/settings/config/${key}/reset`, {
      method: 'POST',
    }),

  // 导出配置
  exportConfigs: (category?: string) => {
    const params = category ? `?category=${category}` : ''
    return fetch(`${API_BASE_URL}/api/settings/config/export${params}`)
      .then(response => response.blob())
  },

  // 导入配置
  importConfigs: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE_URL}/api/settings/config/import`, {
      method: 'POST',
      body: formData,
    }).then(response => response.json())
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

    return apiRequest<UserPaginatedResponse>(`/api/settings/users?${searchParams}`)
  },

  // 获取用户详情
  getUser: (id: string) =>
    apiRequest<User>(`/api/settings/users/${id}`),

  // 创建用户
  createUser: (data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) =>
    apiRequest<User>('/api/settings/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新用户
  updateUser: (id: string, data: Partial<User>) =>
    apiRequest<User>(`/api/settings/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 删除用户
  deleteUser: (id: string) =>
    apiRequest<void>(`/api/settings/users/${id}`, {
      method: 'DELETE',
    }),

  // 重置用户密码
  resetPassword: (id: string, newPassword: string) =>
    apiRequest<void>(`/api/settings/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPassword }),
    }),

  // 锁定/解锁用户
  toggleUserLock: (id: string, locked: boolean) =>
    apiRequest<User>(`/api/settings/users/${id}/lock`, {
      method: 'POST',
      body: JSON.stringify({ locked }),
    }),

  // 获取用户权限
  getUserPermissions: (id: string) =>
    apiRequest<Permission[]>(`/api/settings/users/${id}/permissions`),

  // 批量操作用户 - 暂时使用占位符实现
  bulkOperation: async (operation: UserBulkOperation) => {
    // 暂时返回空实现，等待后端API实现
    console.warn('bulkOperation API 暂未实现', operation)
    return Promise.resolve()
  },

  // 批量导入用户 - 暂时使用占位符实现
  importUsers: async (importData: UserBulkImport) => {
    // 暂时返回空实现，等待后端API实现
    console.warn('importUsers API 暂未实现', importData)
    return Promise.resolve()
  },
}

// 角色管理API
export const roleManagementApi = {
  // 获取角色列表
  getRoles: () =>
    apiRequest<Role[]>('/api/settings/roles'),

  // 获取角色详情
  getRole: (id: string) =>
    apiRequest<Role>(`/api/settings/roles/${id}`),

  // 创建角色
  createRole: (data: Omit<Role, 'id' | 'userCount' | 'createdAt' | 'updatedAt'>) =>
    apiRequest<Role>('/api/settings/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新角色
  updateRole: (id: string, data: Partial<Role>) =>
    apiRequest<Role>(`/api/settings/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 删除角色
  deleteRole: (id: string) =>
    apiRequest<void>(`/api/settings/roles/${id}`, {
      method: 'DELETE',
    }),

  // 获取所有权限
  getPermissions: () =>
    apiRequest<Permission[]>('/api/settings/permissions'),

  // 分配权限给角色
  assignPermissions: (roleId: string, permissionIds: string[]) =>
    apiRequest<Role>(`/api/settings/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds }),
    }),
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

    return apiRequest<{
      items: AuditLog[]
      total: number
      page: number
      pageSize: number
    }>(`/api/settings/audit/logs?${searchParams}`)
  },

  // 获取审计日志详情
  getLog: (id: string) =>
    apiRequest<AuditLog>(`/api/settings/audit/logs/${id}`),

  // 导出审计日志
  exportLogs: (params: AuditLogExportParams): Promise<Blob> =>
    fetch(`${API_BASE_URL}/api/settings/audit/logs/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }).then(response => response.blob()),

  // 清理旧日志
  cleanupLogs: (beforeDate: string) =>
    apiRequest<{ deletedCount: number }>('/api/settings/audit/logs/cleanup', {
      method: 'DELETE',
      body: JSON.stringify({ beforeDate }),
    }),
}

// 备份恢复API
export const backupApi = {
  // 获取备份列表
  getBackups: () =>
    apiRequest<Backup[]>('/api/settings/backup'),

  // 获取备份详情
  getBackup: (id: string) =>
    apiRequest<Backup>(`/api/settings/backup/${id}`),

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
    apiRequest<Backup>('/api/settings/backup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 删除备份
  deleteBackup: (id: string) =>
    apiRequest<void>(`/api/settings/backup/${id}`, {
      method: 'DELETE',
    }),

  // 下载备份
  downloadBackup: (id: string): Promise<Blob> =>
    fetch(`${API_BASE_URL}/api/settings/backup/${id}/download`)
      .then(response => response.blob()),

  // 恢复备份
  restoreBackup: (id: string, options?: {
    overwrite?: boolean
    validateOnly?: boolean
  }) =>
    apiRequest<{ success: boolean; message: string }>(`/api/settings/backup/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  // 验证备份
  validateBackup: (id: string) =>
    apiRequest<{ valid: boolean; issues: string[] }>(`/api/settings/backup/${id}/validate`, {
      method: 'POST',
    }),
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
    return apiRequest<SystemMetrics[]>(`/api/settings/monitoring/metrics${params}`)
  },

  // 获取系统健康状态
  getHealth: () =>
    apiRequest<SystemHealth>('/api/settings/monitoring/health'),

  // 获取系统信息
  getSystemInfo: () =>
    apiRequest<SystemInfo>('/api/settings/system/info'),

  // 重启系统服务
  restartService: (serviceName: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/settings/system/services/${serviceName}/restart`, {
      method: 'POST',
    }),

  // 清理系统缓存
  clearCache: (type?: 'all' | 'session' | 'data' | 'reports') =>
    apiRequest<{ success: boolean; message: string }>('/api/settings/system/cache/clear', {
      method: 'POST',
      body: JSON.stringify({ type: type || 'all' }),
    }),
}

// 通知配置API
export const notificationApi = {
  // 获取通知配置列表
  getConfigs: () =>
    apiRequest<NotificationConfig[]>('/api/settings/notifications'),

  // 获取通知配置详情
  getConfig: (id: string) =>
    apiRequest<NotificationConfig>(`/api/settings/notifications/${id}`),

  // 创建通知配置
  createConfig: (data: Omit<NotificationConfig, 'id'>) =>
    apiRequest<NotificationConfig>('/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新通知配置
  updateConfig: (id: string, data: Partial<NotificationConfig>) =>
    apiRequest<NotificationConfig>(`/api/settings/notifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 删除通知配置
  deleteConfig: (id: string) =>
    apiRequest<void>(`/api/settings/notifications/${id}`, {
      method: 'DELETE',
    }),

  // 测试通知配置
  testConfig: (id: string, recipient?: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/settings/notifications/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ recipient }),
    }),
}

// 安全设置API
export const securityApi = {
  // 获取安全设置
  getSecuritySettings: () =>
    apiRequest<SecurityConfig>('/api/settings/security'),

  // 更新安全设置
  updateSecuritySettings: (data: Partial<SecurityConfig>) =>
    apiRequest<SecurityConfig>('/api/settings/security', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 获取LDAP配置
  getLDAPConfig: () =>
    apiRequest<LDAPConfig>('/api/settings/security/ldap'),

  // 更新LDAP配置
  updateLDAPConfig: (data: Partial<LDAPConfig>) =>
    apiRequest<LDAPConfig>('/api/settings/security/ldap', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 测试LDAP连接
  testLDAPConnection: (config: LDAPConfig) =>
    apiRequest<{ success: boolean; message: string; users?: number }>('/api/settings/security/ldap/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 同步LDAP用户
  syncLDAPUsers: () =>
    apiRequest<{ success: boolean; imported: number; updated: number }>('/api/settings/security/ldap/sync', {
      method: 'POST',
    }),
}

// 许可证API
export const licenseApi = {
  // 获取许可证信息
  getLicense: () =>
    apiRequest<License>('/api/settings/license'),

  // 更新许可证
  updateLicense: (licenseKey: string) =>
    apiRequest<License>('/api/settings/license', {
      method: 'PUT',
      body: JSON.stringify({ licenseKey }),
    }),

  // 验证许可证
  validateLicense: () =>
    apiRequest<{ valid: boolean; message: string }>('/api/settings/license/validate', {
      method: 'POST',
    }),
}