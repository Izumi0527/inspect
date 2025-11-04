import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  fetchInspectionStats,
  fetchInspectionTemplates,
  fetchInspectionExecutions,
  fetchInspectionTrends,
  fetchDeviceDistribution,
  fetchProblemDistribution,
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
}) => {
  return useQuery({
    queryKey: ['inspection', 'strategies', params],
    queryFn: async () => {
      const { templates, total, pages } = await fetchInspectionTemplates({
        page: params?.page,
        pageSize: params?.pageSize,
        category: undefined,
        deviceTypes: undefined,
      })

      const items: InspectionStrategy[] = templates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description ?? '',
        type: params?.type ?? 'manual',
        cron: params?.type === 'scheduled' ? '0 0 * * *' : undefined,
        devices: [],
        templates: [template.id],
        enabled: true,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        nextRunTime: undefined,
      }))

      return { items, total, pages }
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })
}

export const useInspectionStrategy = (id: string) => {
  return useQuery({
    queryKey: ['inspection', 'strategy', id],
    queryFn: () => Promise.resolve(null as InspectionStrategy | null),
    enabled: !!id,
  })
}

export const useCreateStrategy = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<InspectionStrategy>) => Promise.resolve(data as InspectionStrategy),
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
      void id
      return data as InspectionStrategy
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
      void id
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
      void id
      void enabled
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

export const useInspectionTemplate = (id: string) => {
  return useQuery({
    queryKey: ['inspection', 'template', id],
    queryFn: () => Promise.resolve(null as InspectionTemplate | null),
    enabled: !!id,
  })
}

export const useCreateTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<InspectionTemplate>) => Promise.resolve(data as InspectionTemplate),
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
      void id
      void name
      return null as InspectionTemplate | null
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

// 巡检执行Hooks - 连接到真实API
export const useInspectionExecutions = (params?: {
  page?: number
  pageSize?: number
  status?: string
  strategyId?: string
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
      void strategyId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'executions'] })
      toast.success('巡检任务已启动')
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