'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { userManagementApi } from '../api/settings.api'
import { 
  User, UserQueryParams, UserUpdate, 
  UserBulkOperation, UserBulkImport 
} from '../types'

type UseUsersParams = Partial<UserQueryParams>

type CreateUserPayload = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>

type ApiErrorShape = {
  response?: {
    data?: {
      message?: string
    }
  }
  message?: string
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeApiError = error as ApiErrorShape
    const responseMessage = maybeApiError.response?.data?.message
    if (responseMessage) {
      return responseMessage
    }
    if (maybeApiError.message) {
      return maybeApiError.message
    }
  }

  return fallback
}

interface UseUsersResult {
  // 数据状态
  users: User[]
  loading: boolean
  error: string | null
  total: number
  hasNext: boolean
  hasPrev: boolean
  
  // 操作方法
  createUser: (userData: CreateUserPayload) => Promise<void>
  updateUser: (id: string, userData: UserUpdate) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  bulkOperation: (operation: UserBulkOperation) => Promise<void>
  importUsers: (importData: UserBulkImport) => Promise<void>
  refetch: () => void
}

// 查询键常量
const QUERY_KEYS = {
  users: (params: UseUsersParams) => ['users', params],
  userDetail: (id: string) => ['users', id],
  userPermissions: (id: string) => ['users', id, 'permissions'],
  statistics: () => ['users', 'statistics']
} as const

export const useUsers = (params: UseUsersParams = {}): UseUsersResult => {
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // 构建查询参数
  const queryParams: UserQueryParams = {
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    search: params.search,
    role: params.role,
    status: params.status,
    sortBy: params.sortBy || 'created_at',
    sortOrder: params.sortOrder || 'desc'
  }

  // 获取用户列表
  const {
    data: userListData,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: QUERY_KEYS.users(queryParams),
    queryFn: () => userManagementApi.getUsers(queryParams),
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 10 * 60 * 1000, // 10分钟
    retry: 2,
    retryDelay: 1000
  })

  // 创建用户
  const createUserMutation = useMutation({
    mutationFn: userManagementApi.createUser,
    onSuccess: () => {
      // 无效化相关查询缓存
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setError(null)
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error, '创建用户失败'))
    }
  })

  // 更新用户
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) => 
      userManagementApi.updateUser(id, data),
    onSuccess: (updatedUser) => {
      // 更新查询缓存
      queryClient.setQueryData(
        QUERY_KEYS.userDetail(updatedUser.id), 
        updatedUser
      )
      // 无效化用户列表缓存
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setError(null)
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error, '更新用户失败'))
    }
  })

  // 删除用户
  const deleteUserMutation = useMutation({
    mutationFn: userManagementApi.deleteUser,
    onSuccess: (_, deletedId) => {
      // 从缓存中移除用户数据
      queryClient.removeQueries({ queryKey: QUERY_KEYS.userDetail(deletedId) })
      // 无效化用户列表缓存
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setError(null)
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error, '删除用户失败'))
    }
  })

  // 批量操作
  const bulkOperationMutation = useMutation({
    mutationFn: userManagementApi.bulkOperation,
    onSuccess: () => {
      // 无效化所有用户相关缓存
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setError(null)
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error, '批量操作失败'))
    }
  })

  // 批量导入用户
  const importUsersMutation = useMutation({
    mutationFn: userManagementApi.importUsers,
    onSuccess: () => {
      // 无效化所有用户相关缓存
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setError(null)
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error, '用户导入失败'))
    }
  })

  // 包装操作方法
  const createUser = useCallback(async (userData: CreateUserPayload) => {
    try {
      await createUserMutation.mutateAsync(userData)
    } catch (error) {
      throw error
    }
  }, [createUserMutation])

  const updateUser = useCallback(async (id: string, userData: UserUpdate) => {
    try {
      await updateUserMutation.mutateAsync({ id, data: userData })
    } catch (error) {
      throw error
    }
  }, [updateUserMutation])

  const deleteUser = useCallback(async (id: string) => {
    try {
      await deleteUserMutation.mutateAsync(id)
    } catch (error) {
      throw error
    }
  }, [deleteUserMutation])

  const bulkOperation = useCallback(async (operation: UserBulkOperation) => {
    try {
      await bulkOperationMutation.mutateAsync(operation)
    } catch (error) {
      throw error
    }
  }, [bulkOperationMutation])

  const importUsers = useCallback(async (importData: UserBulkImport) => {
    try {
      await importUsersMutation.mutateAsync(importData)
    } catch (error) {
      throw error
    }
  }, [importUsersMutation])

  // 处理错误
  useEffect(() => {
    if (queryError) {
      setError(queryError.message || '获取用户列表失败')
    }
  }, [queryError])

  return {
    // 数据状态
    users: userListData?.items || [],
    loading: isLoading,
    error,
    total: userListData?.total || 0,
    hasNext: userListData?.hasNext || false,
    hasPrev: userListData?.hasPrev || false,
    
    // 操作方法
    createUser,
    updateUser,
    deleteUser,
    bulkOperation,
    importUsers,
    refetch
  }
}

// 获取单个用户详情的Hook
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.userDetail(userId),
    queryFn: () => userManagementApi.getUser(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000
  })
}

// 获取用户权限的Hook
export const useUserPermissions = (userId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.userPermissions(userId),
    queryFn: () => userManagementApi.getUserPermissions(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000
  })
}

// 获取用户统计信息的Hook
export const useUserStatistics = () => {
  return useQuery({
    queryKey: QUERY_KEYS.statistics(),
    queryFn: () => userManagementApi.getUsers({ pageSize: 1 }),
    select: (data) => ({
      totalUsers: data.total,
      // 这里可以添加更多统计逻辑
    }),
    staleTime: 10 * 60 * 1000 // 10分钟
  })
}

// 预加载用户数据的工具函数
export const prefetchUser = (queryClient: QueryClient, userId: string) => {
  return queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.userDetail(userId),
    queryFn: () => userManagementApi.getUser(userId),
    staleTime: 5 * 60 * 1000
  })
}

// 乐观更新工具函数
export const optimisticUpdateUser = (
  queryClient: QueryClient, 
  userId: string, 
  updates: Partial<User>
) => {
  queryClient.setQueryData(
    QUERY_KEYS.userDetail(userId),
    (oldData: User | undefined) => {
      if (!oldData) return oldData
      return { ...oldData, ...updates, updatedAt: new Date().toISOString() }
    }
  )
}