import { httpClient } from '@/lib/api-client'
import type {
  MonitoringResponse,
  MetricHistory,
} from '../types/monitoring.types'

/**
 * 系统监控 API
 */
export const monitoringApi = {
  /**
   * 获取实时监控数据
   */
  getCurrentMetrics: async (): Promise<MonitoringResponse> => {
    return await httpClient.get<MonitoringResponse>('/settings/monitoring/current')
  },

  /**
   * 获取历史监控数据
   * @param hours 获取最近N小时的数据
   */
  getMetricHistory: async (hours: number = 24): Promise<MetricHistory> => {
    return await httpClient.get<MetricHistory>('/settings/monitoring/history', {
      params: { hours },
    })
  },
}
