import { httpClient } from '@/lib/api-client'
import type {
  User,
  UserListResponse,
  RoleListResponse,
  Role,
  Permission,
  UserStats,
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
  BatchOperationRequest,
  UserQueryParams,
} from '../types/users.types'

/**
 * 用户管理 API
 * 提供用户增删改查、角色管理、批量操作等功能
 */
export const usersApi = {
  /**
   * 获取用户列表（支持分页、筛选、排序）
   */
  getUserList: async (params: UserQueryParams = {}): Promise<UserListResponse> => {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      role,
      status,
      department,
      sortBy,
      sortOrder,
    } = params

    const queryParams: Record<string, any> = {
      page,
      page_size: pageSize,
    }

    if (keyword) queryParams.keyword = keyword
    if (role) queryParams.role = role
    if (status) queryParams.status = status
    if (department) queryParams.department = department
    if (sortBy) queryParams.sort_by = sortBy
    if (sortOrder) queryParams.sort_order = sortOrder

    const response = await httpClient.get<{
      users: Array<{
        id: string
        username: string
        email: string
        fullName?: string | null
        role: string
        status: string
        lastLoginAt?: string | null
        createdAt?: string
        updatedAt?: string
      }>
      total_count: number
      page: number
      page_size: number
    }>('/settings/users', { params: queryParams })

    const users: User[] = (response.users || []).map((item) => ({
      id: item.id,
      username: item.username,
      email: item.email,
      fullName: item.fullName || '',
      role: (item.role as any) || 'viewer',
      status: (item.status as any) || 'active',
      lastLoginAt: item.lastLoginAt || null,
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
    }))

    return {
      users,
      totalCount: response.total_count,
      page: response.page,
      pageSize: response.page_size,
    }
  },

  /**
   * 获取单个用户详情
   */
  getUser: async (userId: string): Promise<User> => {
    return await httpClient.get<User>(`/settings/users/${userId}`)
  },

  /**
   * 创建用户
   */
  createUser: async (data: CreateUserRequest): Promise<User> => {
    const snakeCaseData = {
      username: data.username,
      email: data.email,
      password: data.password,
      full_name: data.fullName,
      role: data.role,
      status: data.status,
      force_password_change: data.forcePasswordChange,
    }

    return await httpClient.post<User>('/settings/users', snakeCaseData)
  },

  /**
   * 更新用户信息
   */
  updateUser: async (userId: string, data: UpdateUserRequest): Promise<User> => {
    const snakeCaseData: Record<string, any> = {}
    if (data.email !== undefined) snakeCaseData.email = data.email
    if (data.fullName !== undefined) snakeCaseData.full_name = data.fullName
    if (data.role !== undefined) snakeCaseData.role = data.role
    if (data.status !== undefined) snakeCaseData.status = data.status

    return await httpClient.put<User>(`/settings/users/${userId}`, snakeCaseData)
  },

  /**
   * 删除用户
   */
  deleteUser: async (userId: string): Promise<void> => {
    await httpClient.delete(`/settings/users/${userId}`)
  },

  /**
   * 修改用户密码（管理员重置）
   */
  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await httpClient.post(`/settings/users/${data.userId}/change-password`, {
      new_password: data.newPassword,
    })
  },

  /**
   * 激活用户
   */
  activateUser: async (userId: string): Promise<void> => {
    await httpClient.post(`/settings/users/${userId}/activate`, {})
  },

  /**
   * 停用用户
   */
  deactivateUser: async (userId: string): Promise<void> => {
    await httpClient.post(`/settings/users/${userId}/deactivate`, {})
  },

  /**
   * 锁定用户
   */
  lockUser: async (userId: string): Promise<void> => {
    await httpClient.post(`/settings/users/${userId}/lock`, {})
  },

  /**
   * 解锁用户
   */
  unlockUser: async (userId: string): Promise<void> => {
    await httpClient.post(`/settings/users/${userId}/unlock`, {})
  },

  /**
   * 批量操作
   */
  batchOperation: async (data: BatchOperationRequest): Promise<void> => {
    await httpClient.post('/settings/users/batch', {
      user_ids: data.userIds,
      operation: data.operation,
    })
  },

  /**
   * 获取角色列表
   * ✅ 使用后端真实端点: GET /settings/roles
   */
  getRoleList: async (): Promise<RoleListResponse> => {
    const roles = await httpClient.get<Role[]>('/settings/roles')
    return { roles: roles || [] }
  },

  /**
   * 获取权限列表
   * ✅ 使用后端真实端点: GET /settings/permissions
   */
  getPermissionList: async (): Promise<Permission[]> => {
    const permissions = await httpClient.get<Permission[]>('/settings/permissions')
    return permissions || []
  },

  /**
   * 获取指定用户的权限（按角色展开）
   * ✅ 使用后端真实端点: GET /settings/users/:id/permissions
   */
  getUserPermissions: async (userId: string): Promise<Permission[]> => {
    return await httpClient.get<Permission[]>(`/settings/users/${userId}/permissions`)
  },

  /**
   * 获取用户统计信息
   */
  getUserStats: async (): Promise<UserStats> => {
    const response = await httpClient.get<{
      total_users: number
      active_users: number
      inactive_users: number
      locked_users: number
      admin_count: number
      operator_count: number
      viewer_count: number
    }>('/settings/users/stats')

    return {
      totalUsers: response.total_users,
      activeUsers: response.active_users,
      inactiveUsers: response.inactive_users,
      lockedUsers: response.locked_users,
      adminCount: response.admin_count,
      operatorCount: response.operator_count,
      viewerCount: response.viewer_count,
    }
  },
}
