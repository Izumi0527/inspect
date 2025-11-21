import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users.api'
import type {
  UserListResponse,
  UserStats,
  CreateUserRequest,
  UpdateUserRequest,
  UserQueryParams,
} from '../types/users.types'

/**
 * 用户管理 Hook
 * 管理用户列表、创建、编辑、删除、批量操作等
 */
export function useUserManagement() {
  const queryClient = useQueryClient()

  // 查询参数
  const [queryParams, setQueryParams] = useState<UserQueryParams>({
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })

  // 获取用户列表
  const {
    data: userListData,
    isLoading,
    error,
  } = useQuery<UserListResponse>({
    queryKey: ['userList', queryParams],
    queryFn: () => usersApi.getUserList(queryParams),
    staleTime: 1000 * 60 * 2, // 2分钟缓存
  })

  // 获取用户统计
  const { data: statsData } = useQuery<UserStats>({
    queryKey: ['userStats'],
    queryFn: usersApi.getUserStats,
    staleTime: 1000 * 60 * 5, // 5分钟缓存
  })

  // 创建用户 mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUserRequest) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
  })

  // 更新用户 mutation
  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserRequest }) =>
      usersApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
  })

  // 删除用户 mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => usersApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
  })

  // 修改密码 mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { userId: string; newPassword: string }) =>
      usersApi.changePassword(data),
  })

  // 批量操作 mutation
  const batchOperationMutation = useMutation({
    mutationFn: (data: { userIds: string[]; operation: any }) => usersApi.batchOperation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
  })

  // 更新查询参数
  const updateQueryParams = useCallback((params: Partial<UserQueryParams>) => {
    setQueryParams((prev) => ({ ...prev, ...params }))
  }, [])

  // 创建用户
  const createUser = useCallback(
    async (data: CreateUserRequest) => {
      await createMutation.mutateAsync(data)
    },
    [createMutation]
  )

  // 更新用户
  const updateUser = useCallback(
    async (userId: string, data: UpdateUserRequest) => {
      await updateMutation.mutateAsync({ userId, data })
    },
    [updateMutation]
  )

  // 删除用户
  const deleteUser = useCallback(
    async (userId: string) => {
      await deleteMutation.mutateAsync(userId)
    },
    [deleteMutation]
  )

  // 修改密码
  const changePassword = useCallback(
    async (userId: string, newPassword: string) => {
      await changePasswordMutation.mutateAsync({ userId, newPassword })
    },
    [changePasswordMutation]
  )

  // 激活用户
  const activateUser = useCallback(
    async (userId: string) => {
      await usersApi.activateUser(userId)
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
    [queryClient]
  )

  // 停用用户
  const deactivateUser = useCallback(
    async (userId: string) => {
      await usersApi.deactivateUser(userId)
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
    [queryClient]
  )

  // 锁定用户
  const lockUser = useCallback(
    async (userId: string) => {
      await usersApi.lockUser(userId)
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
    [queryClient]
  )

  // 解锁用户
  const unlockUser = useCallback(
    async (userId: string) => {
      await usersApi.unlockUser(userId)
      queryClient.invalidateQueries({ queryKey: ['userList'] })
      queryClient.invalidateQueries({ queryKey: ['userStats'] })
    },
    [queryClient]
  )

  // 批量操作
  const batchOperation = useCallback(
    async (userIds: string[], operation: 'activate' | 'deactivate' | 'lock' | 'unlock' | 'delete') => {
      await batchOperationMutation.mutateAsync({ userIds, operation })
    },
    [batchOperationMutation]
  )

  return {
    // 数据
    users: userListData?.users || [],
    totalCount: userListData?.totalCount || 0,
    page: userListData?.page || 1,
    pageSize: userListData?.pageSize || 20,
    stats: statsData,
    queryParams,

    // 状态
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isChangingPassword: changePasswordMutation.isPending,
    isBatchOperating: batchOperationMutation.isPending,
    error,

    // 查询方法
    updateQueryParams,

    // 操作方法
    createUser,
    updateUser,
    deleteUser,
    changePassword,
    activateUser,
    deactivateUser,
    lockUser,
    unlockUser,
    batchOperation,
  }
}
