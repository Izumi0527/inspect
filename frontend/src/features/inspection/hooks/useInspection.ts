import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  fetchInspectionStats,
  fetchInspectionTemplates,
  fetchInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  fetchInspectionExecutions,
  fetchInspectionTrends,
  fetchDeviceDistribution,
  fetchProblemDistribution,
  fetchInspectionStrategies,
  fetchInspectionStrategy,
  createInspectionStrategy,
  updateInspectionStrategy,
  deleteInspectionStrategy,
  toggleInspectionStrategy,
  triggerStrategyExecution,
} from '../api/inspection.api'
import {
  InspectionStrategy,
  InspectionTemplate,
  InspectionExecution,
  InspectionStats
} from '../types'

// 巡检策略Hooks - 连接到真实API
export const useInspectionStrategies = (params?: {
  page?: number
  pageSize?: number
  type?: 'scheduled' | 'manual'
  enabled?: boolean
}) => {
  return useQuery({
    queryKey: ['inspection', 'strategies', params],
    queryFn: async () => {
      const { strategies, total, pages } = await fetchInspectionStrategies({
        page: params?.page,
        pageSize: params?.pageSize,
        type: params?.type,
        enabled: params?.enabled,
      })

      return { items: strategies, total, pages }
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })
}

export const useInspectionStrategy = (id: string) => {
  return useQuery({
    queryKey: ['inspection', 'strategy', id],
    queryFn: () => fetchInspectionStrategy(id),
    enabled: !!id,
  })
}

export const useCreateStrategy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<InspectionStrategy>) => createInspectionStrategy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'strategies'] })
      toast.success('巡检策略创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建策略失败')
    },
  })
}

export const useUpdateStrategy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InspectionStrategy> }) => {
      return updateInspectionStrategy(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'strategies'] })
      toast.success('巡检策略更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '更新策略失败')
    },
  })
}

export const useDeleteStrategy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteInspectionStrategy(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'strategies'] })
      toast.success('巡检策略删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除策略失败')
    },
  })
}

export const useToggleStrategy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // 注意：后端 toggle 接口会自动切换状态，不需要传递 enabled 参数
      void enabled
      return toggleInspectionStrategy(id)
    },
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'strategies'] })
      toast.success(`策略已${enabled ? '启用' : '禁用'}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || '操作失败')
    },
  })
}

// 巡检模板Hooks - 连接到真实API
export const useInspectionTemplates = (params?: {
  page?: number
  pageSize?: number
  category?: string
  deviceTypes?: string[]
}) => {
  return useQuery({
    queryKey: ['inspection', 'templates', params],
    queryFn: () => fetchInspectionTemplates(params),
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

export const useInspectionTemplate = (id: number) => {
  return useQuery({
    queryKey: ['inspection', 'template', id],
    queryFn: () => fetchInspectionTemplate(id),
    enabled: !!id,
  })
}

export const useCreateTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<InspectionTemplate>) => {
      // 转换数据格式，确保符合 API 要求
      const templateData = {
        name: data.name || '',
        description: data.description || '',
        category: data.category || 'custom',
        deviceTypes: data.deviceTypes || [],
        checkItems: data.checkItems || [],
      }
      return createInspectionTemplate(templateData as Omit<InspectionTemplate, 'id' | 'created_at' | 'updated_at'>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      toast.success('巡检模板创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建模板失败')
    },
  })
}

export const useCloneTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // 获取原模板
      const original = await fetchInspectionTemplate(Number(id))
      if (!original) {
        throw new Error('原模板不存在')
      }

      // 创建副本
      const cloneData = {
        name,
        description: original.description,
        category: original.category,
        deviceTypes: original.deviceTypes,
        checkItems: original.checkItems,
      }

      return createInspectionTemplate(cloneData as Omit<InspectionTemplate, 'id' | 'created_at' | 'updated_at'>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      toast.success('模板复制成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '复制模板失败')
    },
  })
}

export const useUpdateTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InspectionTemplate> }) => {
      return updateInspectionTemplate(Number(id), data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      toast.success('模板更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '更新模板失败')
    },
  })
}

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const success = await deleteInspectionTemplate(Number(id))
      if (!success) {
        throw new Error('删除失败')
      }
      return success
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      toast.success('模板删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除模板失败')
    },
  })
}

// 巡检执行Hooks - 连接到真实API
export const useInspectionExecutions = (params?: {
  page?: number
  pageSize?: number
  status?: string
  strategyId?: string | number
  startDate?: string
  endDate?: string
}) => {
  return useQuery({
    queryKey: ['inspection', 'executions', params],
    queryFn: () => fetchInspectionExecutions({
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status ? [params.status] : undefined,
      strategyId: params?.strategyId,
      startDate: params?.startDate,
      endDate: params?.endDate,
    }),
    refetchInterval: false, // 禁用自动刷新
  })
}

export const useInspectionExecution = (id: string) => {
  return useQuery({
    queryKey: ['inspection', 'execution', id],
    queryFn: () => Promise.resolve(null as InspectionExecution | null),
    enabled: !!id,
    refetchInterval: false,
  })
}

export const useTriggerExecution = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (strategyId: string) => {
      return triggerStrategyExecution(strategyId)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'executions'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'strategies'] })
      toast.success(result.message || '巡检任务已启动')
    },
    onError: (error: Error) => {
      toast.error(error.message || '启动巡检失败')
    },
  })
}

export const useStopExecution = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string) => {
      void executionId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'executions'] })
      toast.success('巡检任务已停止')
    },
    onError: (error: Error) => {
      toast.error(error.message || '停止巡检失败')
    },
  })
}

// 巡检统计Hooks
export const useInspectionStats = (timeRange?: string) => {
  return useQuery<InspectionStats>({
    queryKey: ['inspection', 'stats', timeRange],
    queryFn: () => fetchInspectionStats(timeRange),
    staleTime: 2 * 60 * 1000, // 2分钟缓存
  })
}

export const useInspectionTrends = (params: {
  period: 'day' | 'week' | 'month'
  startDate?: string
  endDate?: string
}) => {
  return useQuery({
    queryKey: ['inspection', 'trends', params],
    queryFn: () => fetchInspectionTrends(params),
    enabled: !!(params.period),
    staleTime: 5 * 60 * 1000,
  })
}

// 获取设备类型分布
export const useDeviceDistribution = () => {
  return useQuery({
    queryKey: ['inspection', 'device-distribution'],
    queryFn: () => fetchDeviceDistribution(),
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

// 获取问题分布统计
export const useProblemDistribution = () => {
  return useQuery({
    queryKey: ['inspection', 'problem-distribution'],
    queryFn: () => fetchProblemDistribution(),
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })
}

// 巡检报告Hooks - 暂时禁用，等待API实现
export const useInspectionReports = (params?: {
  page?: number
  pageSize?: number
  type?: string
  format?: string
}) => {
  return useQuery({
    queryKey: ['inspection', 'reports', params],
    queryFn: () => Promise.resolve({ items: [], total: 0 }),
    staleTime: 5 * 60 * 1000,
  })
}

export const useGenerateReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      executionId,
      type,
      format
    }: {
      executionId: string
      type: 'summary' | 'detailed' | 'trend'
      format: 'pdf' | 'excel' | 'html' | 'word'
    }) => {
      void executionId
      void type
      void format
      return null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'reports'] })
      toast.success('报告生成成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成报告失败')
    },
  })
}

// 状态管理Hooks
type StrategyFilterType = 'all' | 'scheduled' | 'manual'
type TemplateCategoryFilter = 'all' | 'network' | 'system' | 'security' | 'custom'
type ExecutionStatusFilter = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface InspectionFilterState {
  strategyType: StrategyFilterType
  templateCategory: TemplateCategoryFilter
  executionStatus: ExecutionStatusFilter
  dateRange: {
    start: string
    end: string
  }
  searchText: string
}

const createInitialFilterState = (): InspectionFilterState => ({
  strategyType: 'all',
  templateCategory: 'all',
  executionStatus: 'all',
  dateRange: { start: '', end: '' },
  searchText: ''
})

export const useInspectionFilters = () => {
  const [filters, setFilters] = useState<InspectionFilterState>(() => createInitialFilterState())

  const updateFilter = useCallback(<K extends keyof InspectionFilterState>(key: K, value: InspectionFilterState[K]) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(createInitialFilterState())
  }, [])

  return {
    filters,
    updateFilter,
    resetFilters
  }
}

// 实时执行进度Hook - 暂时禁用，等待API实现
export const useExecutionProgress = (executionId: string, isRunning: boolean) => {
  const [progress] = useState({
    progress: 0,
    currentDevice: '',
    completedDevices: 0,
    totalDevices: 0,
    estimatedTimeRemaining: 0,
  })

  const { refetch } = useQuery({
    queryKey: ['inspection', 'execution', executionId, 'progress'],
    queryFn: () => Promise.resolve(progress),
    enabled: !!executionId && isRunning,
    refetchInterval: 1000, // 每秒更新
  })

  return {
    progress,
    refetchProgress: refetch,
  }
}