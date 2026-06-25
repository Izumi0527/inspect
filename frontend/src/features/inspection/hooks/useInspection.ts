import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api, authorizedDownload, getApiOrigin } from '@/lib/api-client'
import {
  fetchInspectionStats,
  fetchInspectionTemplates,
  fetchInspectionTemplate,
  copyInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  fetchInspectionExecutions,
  fetchExecutionDetail,
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
  generateInspectionReport,
} from '../api/inspection.api'
import {
  InspectionStrategy,
  InspectionTemplate,
  InspectionStats,
  InspectionApiResponse,
  InspectionAnalyticsRange
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
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
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
  search?: string
  vendor?: string
  sort?: string
  order?: 'asc' | 'desc'
}) => {
  return useQuery({
    queryKey: ['inspection', 'templates', params],
    queryFn: () => fetchInspectionTemplates(params),
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

const TEMPLATE_STATS_BATCH_SIZE = 100

export const useInspectionTemplateStats = (params: {
  total: number
  enabled: boolean
  category?: string
  deviceTypes?: string[]
  search?: string
  vendor?: string
}) => {
  const { total, enabled, ...filters } = params

  return useQuery({
    queryKey: ['inspection', 'templates', 'stats', filters, total],
    queryFn: async () => {
      const pageCount = Math.ceil(total / TEMPLATE_STATS_BATCH_SIZE)
      const responses = await Promise.all(
        Array.from({ length: pageCount }, (_, index) =>
          fetchInspectionTemplates({
            ...filters,
            page: index + 1,
            pageSize: TEMPLATE_STATS_BATCH_SIZE,
          })
        )
      )

      const allTemplates = responses.flatMap(response => response.templates)

      return {
        builtInTotal: allTemplates.filter(template => template.isBuiltIn).length,
        customTotal: allTemplates.filter(template => !template.isBuiltIn).length,
        activeTotal: allTemplates.filter(template => template.isActive).length,
      }
    },
    enabled: enabled && total > 0,
    staleTime: 10 * 60 * 1000,
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
        isActive: data.isActive ?? true,
        isBuiltIn: false
      }
      return createInspectionTemplate(templateData as Omit<InspectionTemplate, 'id' | 'createdAt' | 'updatedAt'>)
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
      return copyInspectionTemplate(Number(id), name)
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
    mutationFn: async ({ id, data }: { id: string | number; data: Partial<InspectionTemplate> }) => {
      const numericId = typeof id === 'number' ? id : parseInt(String(id), 10)
      if (!numericId || isNaN(numericId) || numericId <= 0) {
        throw new Error('无效的模板 ID')
      }
      return updateInspectionTemplate(numericId, data)
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
    mutationFn: async (id: string | number) => {
      const numericId = typeof id === 'number' ? id : parseInt(String(id), 10)
      if (!numericId || isNaN(numericId) || numericId <= 0) {
        throw new Error('无效的模板 ID')
      }
      const success = await deleteInspectionTemplate(numericId)
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
    refetchInterval: false, // 禁用自动刷新，由组件控制
    staleTime: 30 * 1000, // 30秒缓存
    retry: 2, // 失败重试2次
  })
}

/**
 * 获取单个执行记录详情
 * 包含完整的设备巡检结果和检查项数据
 */
export const useExecutionDetail = (executionId: string | null) => {
  return useQuery({
    queryKey: ['inspection', 'execution', 'detail', executionId],
    queryFn: () => fetchExecutionDetail(executionId!),
    enabled: !!executionId,
    staleTime: 30 * 1000, // 30秒缓存
    retry: 1,
  })
}

export const useInspectionExecution = (id: string) => {
  return useQuery({
    queryKey: ['inspection', 'execution', id],
    queryFn: async () => {
      if (!id) return null
      // 使用详情 API 获取完整数据
      return fetchExecutionDetail(id)
    },
    enabled: !!id,
    refetchInterval: false,
    staleTime: 30 * 1000,
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
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'trends'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'device-distribution'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'problem-distribution'] })
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
      const response = await api.post<InspectionApiResponse<unknown>>(
        `/inspection/executions/${executionId}/stop`
      )
      if (response.code !== 200) {
        throw new Error(response.message || '停止执行失败')
      }
      return response.data
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

export const useDeleteExecution = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (executionId: string) => {
      const response = await api.delete<InspectionApiResponse<unknown>>(
        `/inspection/executions/${executionId}`
      )
      if (response.code !== 200) {
        throw new Error(response.message || '删除执行记录失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'executions'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'trends'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'device-distribution'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'problem-distribution'] })
      toast.success('执行记录已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除执行记录失败')
    },
  })
}

// 巡检统计Hooks
export const useInspectionStats = (params?: string | InspectionAnalyticsRange) => {
  return useQuery<InspectionStats>({
    queryKey: ['inspection', 'stats', params],
    queryFn: () => fetchInspectionStats(params),
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
export const useDeviceDistribution = (params?: InspectionAnalyticsRange) => {
  return useQuery({
    queryKey: ['inspection', 'device-distribution', params],
    queryFn: () => fetchDeviceDistribution(params),
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

// 获取问题分布统计
export const useProblemDistribution = (params?: InspectionAnalyticsRange) => {
  return useQuery({
    queryKey: ['inspection', 'problem-distribution', params],
    queryFn: () => fetchProblemDistribution(params),
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })
}

// 巡检报告Hooks - 部分实现
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
      console.log('[useGenerateReport] 生成报告请求:', { executionId, type, format })
      
      try {
        const result = await generateInspectionReport({
          task_id: parseInt(executionId, 10),
          format: format === 'html' ? 'pdf' : format, // html 暂不支持，转为 pdf
          template: type
        })
        
        // 如果返回了下载链接，自动下载
        if (result.download_url) {
          // 构建完整的下载URL
          // 后端返回的是 /api/v1/reports/files/{filename}
          // 需要通过后端API访问
          const apiOrigin = getApiOrigin()
          const downloadUrl = result.download_url.startsWith('http') 
            ? result.download_url 
            : `${apiOrigin}${result.download_url}`
          
          console.log('[useGenerateReport] 下载URL:', downloadUrl)
          
          // 使用统一下载工具（Cookie 认证，随请求自动携带 httpOnly access_token）
          const response = await authorizedDownload(downloadUrl)
          
          if (!response.ok) {
            throw new Error('下载文件失败')
          }
          
          // 获取文件blob
          const blob = await response.blob()
          
          // 从Content-Disposition获取文件名，或使用默认名称
          const contentDisposition = response.headers.get('Content-Disposition')
          let filename = `inspection_report_${executionId}.${format}`
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '')
            }
          }
          
          // 创建下载链接
          const blobUrl = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = filename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(blobUrl)
        }
        
        return result
      } catch (error) {
        console.warn('[useGenerateReport] 报告生成失败:', error)
        throw error
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inspection', 'reports'] })
      if (result.download_url) {
        toast.success('报告已生成，正在下载...')
      } else {
        toast.success('报告生成请求已提交')
      }
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
