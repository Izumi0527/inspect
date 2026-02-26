// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { downloadWithAuth } from '@/utils/download'
import {
  reportsApi,
  inspectionReportsApi,
  trendAnalysisApi,
  statisticsApi,
  customReportsApi,
  reportTemplatesApi,
  exportApi,
  reportStatsApi
} from '../api/reports.api'
import {
  Report,
  ReportParameters
} from '../types'

// 报表管理Hooks
export const useReports = (params?: {
  page?: number
  pageSize?: number
  type?: string
  status?: string
  createdBy?: string
  startDate?: string
  endDate?: string
}) => {
  return useQuery({
    queryKey: ['reports', 'list', params],
    queryFn: () => reportsApi.fetchReports(params),
    staleTime: 2 * 60 * 1000, // 2分钟缓存
  })
}

export const useReport = (id: string) => {
  return useQuery({
    queryKey: ['reports', 'detail', id],
    queryFn: () => reportsApi.fetchReport(id),
    enabled: !!id,
  })
}

export const useCreateReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reportsApi.createReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('报表创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建报表失败')
    },
  })
}

export const useUpdateReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Report> }) =>
      reportsApi.updateReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      toast.success('报表更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '更新报表失败')
    },
  })
}

export const useDeleteReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reportsApi.deleteReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('报表删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除报表失败')
    },
  })
}

export const useGenerateReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reportsApi.generateReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      toast.success('报表生成已启动')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成报表失败')
    },
  })
}

export const useCloneReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      reportsApi.cloneReport(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('报表复制成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '复制报表失败')
    },
  })
}

// 巡检报告Hooks
export const useInspectionReportData = (params: {
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  strategies?: string[]
}) => {
  return useQuery({
    queryKey: ['reports', 'inspection', 'data', params],
    queryFn: () => inspectionReportsApi.getInspectionReportData(params),
    enabled: !!(params.dateRange.startDate && params.dateRange.endDate),
    staleTime: 5 * 60 * 1000,
  })
}

export const useGenerateInspectionReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: inspectionReportsApi.generateInspectionReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('巡检报告生成成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成巡检报告失败')
    },
  })
}

export const useCompareDeviceReports = () => {
  return useMutation({
    mutationFn: inspectionReportsApi.compareDeviceReports,
    onError: (error: Error) => {
      toast.error(error.message || '设备报告对比失败')
    },
  })
}

// 趋势分析Hooks
export const useTrendAnalysis = (params: {
  metrics: string[]
  dateRange: {
    startDate: string
    endDate: string
  }
  devices?: string[]
  granularity: 'hour' | 'day' | 'week' | 'month'
}) => {
  return useQuery({
    queryKey: ['reports', 'trends', 'analysis', params],
    queryFn: () => trendAnalysisApi.getTrendAnalysis(params),
    enabled: !!(params.dateRange.startDate && params.dateRange.endDate && params.metrics.length > 0),
    staleTime: 10 * 60 * 1000, // 10分钟缓存
  })
}

export const useGenerateTrendReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: trendAnalysisApi.generateTrendReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('趋势报告生成成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成趋势报告失败')
    },
  })
}

export const usePredictions = (params: {
  metrics: string[]
  devices?: string[]
  timeframe: 'week' | 'month' | 'quarter'
}) => {
  return useQuery({
    queryKey: ['reports', 'trends', 'predictions', params],
    queryFn: () => trendAnalysisApi.getPredictions(params),
    enabled: params.metrics.length > 0,
    staleTime: 30 * 60 * 1000, // 30分钟缓存
  })
}

export const useAnomalyDetection = () => {
  return useMutation({
    mutationFn: trendAnalysisApi.getAnomalyDetection,
    onError: (error: Error) => {
      toast.error(error.message || '异常检测失败')
    },
  })
}

// 统计报表Hooks
export const useStatistics = (params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  deviceTypes?: string[]               // ✅ 改名为device_types对应
  locations?: string[]                 // ✅ 新增位置筛选
  deviceGroups?: string[]              // ✅ 新增设备组筛选
  groupBy?: 'hour' | 'day' | 'week' | 'month'  // ✅ 时间粒度而非分组维度
  includeTrends?: boolean              // ✅ 改名
}) => {
  return useQuery({
    queryKey: ['reports', 'statistics', 'data', params],
    queryFn: () => statisticsApi.getStatistics(params),
    enabled: !!(params.startDate && params.endDate),
    staleTime: 5 * 60 * 1000,
  })
}

export const useGenerateStatisticsReport = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: statisticsApi.generateStatisticsReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('统计报表生成成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成统计报表失败')
    },
  })
}

export const useKPIData = (params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  deviceTypes?: string[]               // ✅ 改名为device_types对应
  comparisonPeriod?: 'previous_period' | 'previous_year'  // ✅ 对比周期
}) => {
  return useQuery({
    queryKey: ['reports', 'statistics', 'kpi', params],
    queryFn: () => statisticsApi.getKPIData(params),
    enabled: !!(params.startDate && params.endDate),
    staleTime: 5 * 60 * 1000,
  })
}

export const useRankings = (params: {
  startDate: string                    // ✅ 扁平化日期参数
  endDate: string
  rankingType?: 'performance' | 'reliability' | 'efficiency'  // ✅ 改名为ranking_type
  deviceTypes?: string[]               // ✅ 设备类型筛选
  topN?: number                        // ✅ 改名为top_n
  includeBottom?: boolean              // ✅ 是否包含后N名
}) => {
  return useQuery({
    queryKey: ['reports', 'statistics', 'rankings', params],
    queryFn: () => statisticsApi.getRankings(params),
    enabled: !!(params.startDate && params.endDate),
    staleTime: 10 * 60 * 1000,
  })
}

// 自定义报表Hooks
export const useCustomReportConfigs = () => {
  return useQuery({
    queryKey: ['reports', 'custom', 'configs'],
    queryFn: customReportsApi.fetchCustomReportConfigs,
    staleTime: 10 * 60 * 1000,
  })
}

export const useCustomReportConfig = (id: string) => {
  return useQuery({
    queryKey: ['reports', 'custom', 'config', id],
    queryFn: () => customReportsApi.fetchCustomReportConfig(id),
    enabled: !!id,
  })
}

export const useCreateCustomReportConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: customReportsApi.createCustomReportConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'custom', 'configs'] })
      toast.success('自定义报表配置创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建配置失败')
    },
  })
}

export const useGenerateFromConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ configId, parameters, format }: {
      configId: number
      parameters?: Record<string, any>
      format?: string
    }) => customReportsApi.generateFromConfig(String(configId), parameters, format),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] })
      toast.success('自定义报表生成成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '生成报表失败')
    },
  })
}

export const usePreviewCustomReportConfig = (
  configId: number,
  options?: { parameters?: Record<string, any>; limit?: number }
) => {
  return useQuery({
    queryKey: ['reports', 'custom', 'preview', configId, options],
    queryFn: () =>
      customReportsApi.previewCustomReportConfig(
        String(configId),
        options?.parameters,
        options?.limit
      ),
    enabled: !!configId,
    staleTime: 30 * 1000, // 30秒缓存
  })
}

// 报表模板Hooks
export const useReportTemplates = () => {
  return useQuery({
    queryKey: ['reports', 'templates'],
    queryFn: reportTemplatesApi.fetchReportTemplates,
    staleTime: 30 * 60 * 1000, // 30分钟缓存
  })
}

export const useReportTemplate = (id: string) => {
  return useQuery({
    queryKey: ['reports', 'template', id],
    queryFn: () => reportTemplatesApi.fetchReportTemplate(id),
    enabled: !!id,
  })
}

export const useCreateReportTemplate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reportTemplatesApi.createReportTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'templates'] })
      toast.success('报表模板创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建模板失败')
    },
  })
}

// 导出Hooks
export const useExportToExcel = () => {
  return useMutation({
    mutationFn: exportApi.exportToExcel,
    onSuccess: async (downloadUrl) => {
      try {
        // 后端当前导出实现为 CSV（文件名为 export-*.csv）
        await downloadWithAuth(downloadUrl, `report_${Date.now()}.csv`)
        toast.success('Excel导出成功')
      } catch (error) {
        console.error('Excel导出下载失败:', error)
        toast.error('Excel下载失败')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Excel导出失败')
    },
  })
}

export const useExportToPDF = () => {
  return useMutation({
    mutationFn: exportApi.exportToPDF,
    onSuccess: async (downloadUrl) => {
      try {
        await downloadWithAuth(downloadUrl, `report_${Date.now()}.pdf`)
        toast.success('PDF导出成功')
      } catch (error) {
        console.error('PDF导出下载失败:', error)
        toast.error('PDF下载失败')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'PDF导出失败')
    },
  })
}

export const useExportToWord = () => {
  return useMutation({
    mutationFn: exportApi.exportToWord,
    onSuccess: async (downloadUrl) => {
      try {
        // 后端当前导出实现为 .doc 文本文件
        await downloadWithAuth(downloadUrl, `report_${Date.now()}.doc`)
        toast.success('Word导出成功')
      } catch (error) {
        console.error('Word导出下载失败:', error)
        toast.error('Word下载失败')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Word导出失败')
    },
  })
}

// 报表统计Hooks
export const useReportStats = () => {
  return useQuery({
    queryKey: ['reports', 'stats'],
    queryFn: reportStatsApi.fetchReportStats,
    staleTime: 5 * 60 * 1000,
  })
}

export const useUsageAnalysis = (params: {
  dateRange: {
    startDate: string
    endDate: string
  }
}) => {
  return useQuery({
    queryKey: ['reports', 'usage', params],
    queryFn: () => reportStatsApi.getUsageAnalysis(params),
    enabled: !!(params.dateRange.startDate && params.dateRange.endDate),
    staleTime: 10 * 60 * 1000,
  })
}

// 状态管理Hooks
export const useReportFilters = () => {
  const [filters, setFilters] = useState({
    type: 'all' as 'all' | 'inspection' | 'trend' | 'statistics' | 'custom',
    status: 'all' as 'all' | 'generating' | 'completed' | 'failed' | 'scheduled',
    format: 'all' as 'all' | 'pdf' | 'excel' | 'html' | 'word',
    dateRange: {
      start: '',
      end: '',
    },
    createdBy: 'all' as 'all' | string,
    searchText: '',
  })

  const updateFilter = useCallback((key: string, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      type: 'all',
      status: 'all',
      format: 'all',
      dateRange: { start: '', end: '' },
      createdBy: 'all',
      searchText: '',
    })
  }, [])

  return {
    filters,
    updateFilter,
    resetFilters,
  }
}

// 报表参数管理Hook
export const useReportParameters = () => {
  const [parameters, setParameters] = useState<ReportParameters>({
    dateRange: {
      startDate: '',
      endDate: '',
    },
    devices: [],
    deviceGroups: [],
    strategies: [],
    templates: [],
    includeCharts: true,
    includeDetailData: true,
    includeRecommendations: true,
  })

  const updateParameters = useCallback((updates: Partial<ReportParameters>) => {
    setParameters(prev => ({
      ...prev,
      ...updates,
    }))
  }, [])

  const resetParameters = useCallback(() => {
    setParameters({
      dateRange: {
        startDate: '',
        endDate: '',
      },
      devices: [],
      deviceGroups: [],
      strategies: [],
      templates: [],
      includeCharts: true,
      includeDetailData: true,
      includeRecommendations: true,
    })
  }, [])

  return {
    parameters,
    updateParameters,
    resetParameters,
  }
}

// 报表生成进度Hook
export const useReportProgress = (reportId: string, isGenerating: boolean) => {
  const [progress, setProgress] = useState({
    progress: 0,
    currentStep: '',
    estimatedTimeRemaining: 0,
    status: 'generating' as 'generating' | 'completed' | 'failed',
  })

  const { data, refetch } = useQuery({
    queryKey: ['reports', 'progress', reportId],
    queryFn: () => reportsApi.fetchReport(reportId),
    enabled: !!reportId && isGenerating,
    refetchInterval: 2000, // 每2秒更新
  })

  // 更新进度状态
  useEffect(() => {
    if (data) {
      setProgress({
        progress: data.status === 'completed' ? 100 :
                 data.status === 'failed' ? 0 :
                 Math.random() * 100, // 模拟进度
        currentStep: data.status === 'generating' ? '正在生成报表...' :
                    data.status === 'completed' ? '生成完成' : '生成失败',
        estimatedTimeRemaining: data.status === 'generating' ? Math.random() * 60 : 0,
        status: data.status === 'failed' ? 'failed' : data.status === 'completed' ? 'completed' : 'generating',
      })
    }
  }, [data])

  return {
    progress,
    refetchProgress: refetch,
  }
}
