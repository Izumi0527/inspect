import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userManagementApi } from '../api/settings.api'
import { User } from '../types'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'
import toast from 'react-hot-toast'

export const useUsers = (params?: {
  page?: number
  pageSize?: number
  role?: string
  status?: string
  search?: string
}) => {
  return useQuery({
    queryKey: ['settings', 'users', params],
    queryFn: () => userManagementApi.getUsers(params),
    staleTime: 2 * 60 * 1000,
  })
}

export const useUser = (id: string) => {
  return useQuery({
    queryKey: ['settings', 'users', 'detail', id],
    queryFn: () => userManagementApi.getUser(id),
    enabled: !!id,
  })
}

export const useCreateUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: userManagementApi.createUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      showSuccessToast('用户创建成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '用户创建失败')
    },
  })
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) =>
      userManagementApi.updateUser(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      showSuccessToast('用户更新成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '用户更新失败')
    },
  })
}

export const useDeleteUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: userManagementApi.deleteUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      showSuccessToast('用户删除成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '用户删除失败')
    },
  })
}

export const useResetPassword = () => {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      userManagementApi.resetPassword(id, password),
    onSuccess: (data) => {
      showSuccessToast('密码重置成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '密码重置失败')
    },
  })
}

export const useToggleUserLock = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      userManagementApi.toggleUserLock(id, locked),
    onSuccess: (_, { locked }) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
      toast.success(`用户已${locked ? '锁定' : '解锁'}`)
    },
    onError: (error: Error) => {
      showErrorToast(error, '操作失败')
    },
  })
}