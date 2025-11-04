import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { roleManagementApi } from '../api/settings.api'
import { Role } from '../types'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useRoles = () => {
  return useQuery({
    queryKey: ['settings', 'roles'],
    queryFn: roleManagementApi.getRoles,
    staleTime: 10 * 60 * 1000,
  })
}

export const useRole = (id: string) => {
  return useQuery({
    queryKey: ['settings', 'roles', 'detail', id],
    queryFn: () => roleManagementApi.getRole(id),
    enabled: !!id,
  })
}

export const usePermissions = () => {
  return useQuery({
    queryKey: ['settings', 'permissions'],
    queryFn: roleManagementApi.getPermissions,
    staleTime: 30 * 60 * 1000, // 30分钟缓存
  })
}

export const useCreateRole = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: roleManagementApi.createRole,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      showSuccessToast('角色创建成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '角色创建失败')
    },
  })
}

export const useUpdateRole = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Role> }) =>
      roleManagementApi.updateRole(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      showSuccessToast('角色更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '角色更新失败')
    },
  })
}

export const useDeleteRole = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: roleManagementApi.deleteRole,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] })
      showSuccessToast('角色删除成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '角色删除失败')
    },
  })
}