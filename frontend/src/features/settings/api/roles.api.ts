import { httpClient } from '@/lib/api-client'
import type { Permission, Role } from '../types/users.types'

type BackendRole = Omit<Role, 'permissionIds'> & {
  // 后端返回字段存在 snake_case / camelCase 的混用情况，这里做一次兼容映射
  permission_ids?: string[]
  permissionIds?: string[]
}

const mapRole = (role: BackendRole): Role => {
  const permissionIds =
    role.permissionIds ||
    role.permission_ids ||
    (Array.isArray(role.permissions) ? role.permissions.map((p) => p.id).filter(Boolean) : [])

  return {
    ...role,
    description: role.description || '',
    permissions: role.permissions || [],
    permissionIds,
  }
}

export const rolesApi = {
  /**
   * 获取角色列表
   * GET /api/v1/settings/roles
   */
  listRoles: async (): Promise<Role[]> => {
    const roles = await httpClient.get<BackendRole[]>('/settings/roles')
    return (roles || []).map(mapRole)
  },

  /**
   * 获取角色详情
   * GET /api/v1/settings/roles/:role_id
   */
  getRole: async (roleId: string): Promise<Role> => {
    const role = await httpClient.get<BackendRole>(`/settings/roles/${roleId}`)
    return mapRole(role)
  },

  /**
   * 创建角色
   * POST /api/v1/settings/roles
   */
  createRole: async (data: { name: string; displayName?: string; description?: string }): Promise<Role> => {
    const payload: Record<string, any> = {
      name: data.name,
    }
    if (data.displayName !== undefined) payload.displayName = data.displayName
    if (data.description !== undefined) payload.description = data.description

    const role = await httpClient.post<BackendRole>('/settings/roles', payload)
    return mapRole(role)
  },

  /**
   * 更新角色
   * PUT /api/v1/settings/roles/:role_id
   */
  updateRole: async (
    roleId: string,
    data: { displayName?: string; description?: string; name?: string }
  ): Promise<Role> => {
    const payload: Record<string, any> = {}
    if (data.name !== undefined) payload.name = data.name
    if (data.displayName !== undefined) payload.displayName = data.displayName
    if (data.description !== undefined) payload.description = data.description

    const role = await httpClient.put<BackendRole>(`/settings/roles/${roleId}`, payload)
    return mapRole(role)
  },

  /**
   * 删除角色
   * DELETE /api/v1/settings/roles/:role_id
   */
  deleteRole: async (roleId: string): Promise<void> => {
    await httpClient.delete(`/settings/roles/${roleId}`)
  },

  /**
   * 获取权限列表
   * GET /api/v1/settings/permissions
   */
  listPermissions: async (): Promise<Permission[]> => {
    const permissions = await httpClient.get<Permission[]>('/settings/permissions')
    return permissions || []
  },

  /**
   * 分配角色权限（全量覆盖）
   * POST /api/v1/settings/roles/:role_id/permissions
   */
  assignRolePermissions: async (roleId: string, permissionIds: string[]): Promise<void> => {
    await httpClient.post(`/settings/roles/${roleId}/permissions`, {
      permissionIds,
    })
  },
}

