/**
 * 日志中心 API 接口
 */
import { api } from '@/lib/api-client'
import type {
  DeviceLog,
  LogParsingRule,
  LogStatistics,
  LogQueryParams,
  LogListResponse,
  LogCollectionRequest,
  LogCollectionResponse
} from '../types'

const BASE_URL = '/logs'

/**
 * 获取日志统计信息
 */
export async function getLogStatistics(hours: number = 24): Promise<LogStatistics> {
  const response = await api.get<{ data: LogStatistics }>(`${BASE_URL}/statistics`, {
    params: { hours }
  })
  return response.data
}

/**
 * 获取设备日志列表
 */
export async function getDeviceLogs(
  deviceId: number,
  params: LogQueryParams = {}
): Promise<LogListResponse> {
  const response = await api.get<{ data: LogListResponse }>(`${BASE_URL}/devices/${deviceId}/logs`, {
    params: {
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      level: params.level,
      facility: params.facility,
      search: params.search,
      start_time: params.start_time,
      end_time: params.end_time
    }
  })
  return response.data
}

/**
 * 获取所有日志列表
 */
export async function getAllLogs(params: LogQueryParams = {}): Promise<LogListResponse> {
  const response = await api.get<{ data: LogListResponse }>(`${BASE_URL}`, {
    params: {
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      device_id: params.device_id,
      level: params.level,
      facility: params.facility,
      search: params.search,
      start_time: params.start_time,
      end_time: params.end_time
    }
  })
  return response.data
}

/**
 * 搜索日志
 */
export async function searchLogs(
  keyword: string,
  params: LogQueryParams = {}
): Promise<LogListResponse> {
  const response = await api.get<{ data: LogListResponse }>(`${BASE_URL}/search`, {
    params: {
      keyword,
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      device_id: params.device_id,
      level: params.level
    }
  })
  return response.data
}

/**
 * 获取最近日志
 */
export async function getRecentLogs(
  hours: number = 24,
  limit: number = 100
): Promise<DeviceLog[]> {
  const response = await api.get<{ data: DeviceLog[] }>(`${BASE_URL}/recent`, {
    params: { hours, limit }
  })
  return response.data
}

/**
 * 采集设备日志
 */
export async function collectDeviceLogs(
  deviceId: number,
  request: LogCollectionRequest
): Promise<LogCollectionResponse> {
  const response = await api.post<{ data: LogCollectionResponse }>(
    `${BASE_URL}/devices/${deviceId}/logs/collect`,
    request
  )
  return response.data
}

/**
 * 批量采集日志
 */
export async function batchCollectLogs(
  deviceIds: number[],
  logType: string = 'system'
): Promise<LogCollectionResponse> {
  const response = await api.post<{ data: LogCollectionResponse }>(`${BASE_URL}/batch-collect`, {
    device_ids: deviceIds,
    log_type: logType
  })
  return response.data
}

/**
 * 获取日志解析规则列表
 */
export async function getParsingRules(): Promise<LogParsingRule[]> {
  const response = await api.get<{ data: LogParsingRule[] }>(`${BASE_URL}/parsing-rules`)
  return response.data
}

/**
 * 创建日志解析规则
 */
export async function createParsingRule(
  rule: Omit<LogParsingRule, 'id' | 'created_at' | 'updated_at'>
): Promise<LogParsingRule> {
  const response = await api.post<{ data: LogParsingRule }>(`${BASE_URL}/parsing-rules`, rule)
  return response.data
}

/**
 * 更新日志解析规则
 */
export async function updateParsingRule(
  ruleId: number,
  rule: Partial<LogParsingRule>
): Promise<LogParsingRule> {
  const response = await api.put<{ data: LogParsingRule }>(`${BASE_URL}/parsing-rules/${ruleId}`, rule)
  return response.data
}

/**
 * 删除日志解析规则
 */
export async function deleteParsingRule(ruleId: number): Promise<void> {
  await api.delete(`${BASE_URL}/parsing-rules/${ruleId}`)
}

/**
 * 删除日志记录
 */
export async function deleteLog(logId: number): Promise<void> {
  await api.delete(`${BASE_URL}/${logId}`)
}

/**
 * 批量删除日志
 */
export async function batchDeleteLogs(logIds: number[]): Promise<{ deleted_count: number }> {
  const response = await api.post<{ data: { deleted_count: number } }>(`${BASE_URL}/batch-delete`, {
    log_ids: logIds
  })
  return response.data
}

/**
 * 导出日志
 */
export async function exportLogs(params: LogQueryParams): Promise<Blob> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    page: params.page,
    page_size: params.page_size,
    device_id: params.device_id,
    level: params.level,
    facility: params.facility,
    search: params.search,
    start_time: params.start_time,
    end_time: params.end_time
  }
  const response = await api.get<{ data: Blob }>(`${BASE_URL}/export`, {
    params: queryParams
  })
  return response.data
}
