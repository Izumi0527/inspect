import { useQuery, useMutation } from '@tanstack/react-query'
import { systemMonitoringApi } from '../api/settings.api'
import { showSuccessToast, showErrorToast } from './utils/toastHandlers'

export const useSystemMetrics = (timeRange?: {
  startTime: string
  endTime: string
  interval?: '1m' | '5m' | '15m' | '1h' | '1d'
}) => {
  return useQuery({
    queryKey: ['settings', 'monitoring', 'metrics', timeRange],
    queryFn: () => systemMonitoringApi.getMetrics(timeRange),
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  })
}

export const useSystemHealth = () => {
  return useQuery({
    queryKey: ['settings', 'monitoring', 'health'],
    queryFn: systemMonitoringApi.getHealth,
    refetchInterval: 15 * 1000,
    staleTime: 5 * 1000,
  })
}

export const useSystemInfo = () => {
  return useQuery({
    queryKey: ['settings', 'system', 'info'],
    queryFn: systemMonitoringApi.getSystemInfo,
    staleTime: 10 * 60 * 1000,
  })
}

export const useRestartService = () => {
  return useMutation({
    mutationFn: systemMonitoringApi.restartService,
    onSuccess: (data) => {
      showSuccessToast('服务重启成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '服务重启失败')
    },
  })
}

export const useClearCache = () => {
  return useMutation({
    mutationFn: systemMonitoringApi.clearCache,
    onSuccess: (data) => {
      showSuccessToast('缓存清理成功', data)
    },
    onError: (error: Error) => {
      showErrorToast(error, '缓存清理失败')
    },
  })
}