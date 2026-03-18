import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { monitoringApi } from '../api/monitoring.api'
import { systemMonitoringApi } from '../api/settings.api'
import type {
  MonitoringResponse,
  MetricHistory,
} from '../types/monitoring.types'
import type {
  SystemMetrics,
  SystemHealth,
  SystemInfo,
} from '../types'

/**
 * 获取系统指标
 * 用于获取系统性能指标数据（CPU、内存、磁盘、网络等）
 */
export const useSystemMetrics = (timeRange?: {
  startTime: string
  endTime: string
  interval?: '1m' | '5m' | '15m' | '1h' | '1d'
}) => {
  return useQuery<SystemMetrics[]>({
    queryKey: ['settings', 'monitoring', 'metrics', timeRange],
    queryFn: () => systemMonitoringApi.getMetrics(timeRange),
    staleTime: 30 * 1000, // 30秒缓存
    refetchInterval: 5000, // 每5秒自动刷新
  })
}

/**
 * 获取系统健康状态
 * 用于获取系统整体健康状况和服务状态
 */
export const useSystemHealth = () => {
  return useQuery<SystemHealth>({
    queryKey: ['settings', 'monitoring', 'health'],
    queryFn: systemMonitoringApi.getHealth,
    staleTime: 30 * 1000, // 30秒缓存
    refetchInterval: 10000, // 每10秒自动刷新
  })
}

/**
 * 获取系统信息
 * 用于获取系统基本信息（操作系统、版本、硬件配置等）
 */
export const useSystemInfo = () => {
  return useQuery<SystemInfo>({
    queryKey: ['settings', 'system', 'info'],
    queryFn: systemMonitoringApi.getSystemInfo,
    staleTime: 5 * 60 * 1000, // 5分钟缓存（系统信息不常变）
  })
}

/**
 * 重启系统服务
 * 用于重启指定的系统服务
 */
export const useRestartService = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serviceName: string) =>
      systemMonitoringApi.restartService(serviceName),
    onSuccess: (data, serviceName) => {
      // 使监控相关查询失效，强制重新获取
      queryClient.invalidateQueries({ queryKey: ['settings', 'monitoring'] })
      queryClient.invalidateQueries({ queryKey: ['systemMonitoring'] })
      console.log(`服务 ${serviceName} 重启成功:`, data)
    },
    onError: (error: Error, serviceName) => {
      console.error(`服务 ${serviceName} 重启失败:`, error)
    },
  })
}

/**
 * 清理系统缓存
 * 用于清理系统缓存（支持不同类型的缓存清理）
 */
export const useClearCache = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (type?: 'all' | 'session' | 'data' | 'reports') =>
      systemMonitoringApi.clearCache(type),
    onSuccess: (data) => {
      // 清除本地查询缓存
      queryClient.clear()
      console.log('缓存清理成功:', data)
    },
    onError: (error: Error) => {
      console.error('缓存清理失败:', error)
    },
  })
}

/**
 * 系统监控 Hook（综合版本）
 * 用于获取完整的系统监控数据，包括实时指标和历史数据
 */
export function useSystemMonitoring(autoRefresh: boolean = true) {
  // 获取实时监控数据（自动刷新）
  const {
    data: monitoringData,
    isLoading,
    error,
    refetch,
  } = useQuery<MonitoringResponse>({
    queryKey: ['systemMonitoring'],
    queryFn: monitoringApi.getCurrentMetrics,
    refetchInterval: autoRefresh ? 5000 : false, // 每5秒刷新
    staleTime: 0, // 数据始终视为过期，确保实时性
  })

  // 获取历史数据（不自动刷新）
  const { data: historyData } = useQuery<MetricHistory>({
    queryKey: ['metricHistory'],
    queryFn: () => monitoringApi.getMetricHistory(24),
    staleTime: 1000 * 60 * 5, // 5分钟缓存
  })

  return {
    // 数据
    metrics: monitoringData?.metrics,
    services: monitoringData?.services || [],
    system: monitoringData?.system,
    history: historyData,
    timestamp: monitoringData?.timestamp,

    // 状态
    isLoading,
    error,
    refetch,
  }
}
