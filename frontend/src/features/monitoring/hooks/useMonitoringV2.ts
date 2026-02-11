import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { fetchMonitoringDataV2 } from '../api/monitoring.api'
import type { MonitoringDataV2 } from '../types'

/**
 * 监控中心 v2 自定义 Hook
 *
 * @description
 * 封装监控数据获取逻辑，直接使用真实后端 API:
 * - 自动轮询刷新
 * - 错误处理与重试
 * - 加载状态管理
 * - React Query 缓存优化
 *
 * @example
 * ```tsx
 * function MonitoringView() {
 *   const { data, isLoading, error, refetch } = useMonitoringV2({
 *     timeRange: '24h',
 *     refetchInterval: 60000,
 *   })
 *
 *   if (isLoading) return <LoadingSkeleton />
 *   if (error) return <ErrorMessage error={error} />
 *
 *   return <MonitoringDashboard data={data} />
 * }
 * ```
 */

interface UseMonitoringV2Options {
  /**
   * 时间范围
   * @default '24h'
   */
  timeRange?: string

  /**
   * 轮询间隔（毫秒）
   * @default 120000 (2分钟)
   */
  refetchInterval?: number

  /**
   * 是否启用轮询
   * @default true
   */
  enablePolling?: boolean
}

export function useMonitoringV2(
  options: UseMonitoringV2Options = {}
): UseQueryResult<Partial<MonitoringDataV2>, Error> {
  const {
    timeRange = '24h',
    refetchInterval = 120000, // 默认 2 分钟 (120秒) - 比后端采集快，确保及时获取新数据
    enablePolling = true,
  } = options

  return useQuery<Partial<MonitoringDataV2>, Error>({
    queryKey: ['monitoring-v2', timeRange],

    queryFn: async () => {
      console.log('[useMonitoringV2] Fetching data from real API, timeRange:', timeRange)
      return await fetchMonitoringDataV2(timeRange)
    },

    // 轮询配置
    refetchInterval: enablePolling ? refetchInterval : false,

    // 窗口聚焦时重新获取
    refetchOnWindowFocus: true,

    // 重连时重新获取
    refetchOnReconnect: true,

    // 缓存时间 (5 分钟)
    gcTime: 5 * 60 * 1000,

    // 陈旧时间 (1 分钟后标记为陈旧)
    staleTime: 60 * 1000,

    // 重试配置 - 最多重试 3 次
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false

      // 如果是网络错误，重试
      if (error instanceof Error && error.message.includes('网络')) {
        return true
      }

      return false
    },

    // 重试延迟（指数退避）
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

