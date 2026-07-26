import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { fetchMonitoringDevices } from '../api/monitoring.api'
import type { MonitoringDeviceOption } from '../types'
import { useAuth } from '@/lib/contexts/auth-context'

/**
 * 监控设备列表 Hook（设备筛选下拉数据源）
 *
 * 设备台账变化频率低，采用较长的 staleTime 减少无谓请求；
 * 页面刷新/窗口聚焦时仍会按 React Query 默认行为更新。
 */
export function useMonitoringDevices(): UseQueryResult<MonitoringDeviceOption[], Error> {
  const { user } = useAuth()
  const userCacheKey = user?.id ? `user:${user.id}` : 'user:anonymous'

  return useQuery<MonitoringDeviceOption[], Error>({
    queryKey: ['monitoring-devices', userCacheKey],
    queryFn: fetchMonitoringDevices,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: (failureCount) => failureCount < 1,
  })
}
