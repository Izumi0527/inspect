import { keepPreviousData, useQuery, UseQueryResult } from '@tanstack/react-query'
import { fetchDeviceInterfaceTraffic } from '../api/monitoring.api'
import type { DeviceInterfaceTraffic } from '../types'
import { useAuth } from '@/lib/contexts/auth-context'

/** 接口流量查询的 key 前缀；页面级刷新（手动/WS 推送）据此失效全部接口流量查询 */
export const INTERFACE_TRAFFIC_QUERY_KEY = 'monitoring-interface-traffic'

interface UseDeviceInterfaceTrafficOptions {
  /** 单台设备 ID；null = 未处于单设备视图，不发起请求 */
  deviceId: number | null
  timeRange: string
  /** 接口采集名（if<idx>）；空 = 全部 UP 接口汇总 */
  interfaceName: string
  /** 页面可见时才轮询（与 v2 聚合查询同步） */
  enablePolling?: boolean
}

/**
 * 单台设备的接口流量时序（监控中心流量卡「接口视图」数据源）
 *
 * 切换接口/时间范围时用 keepPreviousData 保留上一帧，避免图表闪骨架屏。
 */
export function useDeviceInterfaceTraffic({
  deviceId,
  timeRange,
  interfaceName,
  enablePolling = true,
}: UseDeviceInterfaceTrafficOptions): UseQueryResult<DeviceInterfaceTraffic, Error> {
  const { user } = useAuth()
  const userCacheKey = user?.id ? `user:${user.id}` : 'user:anonymous'

  return useQuery<DeviceInterfaceTraffic, Error>({
    queryKey: [INTERFACE_TRAFFIC_QUERY_KEY, userCacheKey, deviceId, timeRange, interfaceName],
    queryFn: () => fetchDeviceInterfaceTraffic(deviceId as number, timeRange, interfaceName),
    enabled: deviceId !== null,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: enablePolling ? 120000 : false,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < 1,
  })
}
