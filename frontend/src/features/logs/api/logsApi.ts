/**
 * 日志中心 API 接口
 */
import { api, API_PREFIX, getApiOrigin, TokenManager } from '@/lib/api-client'
import type {
  DeviceLog,
  LogParsingRule,
  LogStatistics,
  LogQueryParams,
  LogExportParams,
  LogListResponse,
  LogCollectionRequest,
  LogCollectionResponse
} from '../types'

const BASE_URL = '/logs'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * 兼容不同后端/历史实现的响应结构：
 * - 裸对象/数组：X
 * - 数据包装：{ data: X }
 * - 标准信封：{ success: true, data: X }
 */
const unwrapPayload = <T>(payload: unknown): T => {
  if (isObject(payload)) {
    if ('success' in payload && payload.success === true && 'data' in payload) {
      return payload.data as T
    }
    if ('data' in payload) {
      return unwrapPayload<T>(payload.data)
    }
  }
  return payload as T
}

/**
 * 获取日志统计信息
 */
export async function getLogStatistics(hours: number = 24): Promise<LogStatistics> {
  const payload = await api.get<unknown>(`${BASE_URL}/statistics`, {
    params: { hours }
  })
  return unwrapPayload<LogStatistics>(payload)
}

/**
 * 获取设备日志列表
 */
export async function getDeviceLogs(
  deviceId: number,
  params: LogQueryParams = {}
): Promise<LogListResponse> {
  const payload = await api.get<unknown>(`${BASE_URL}/devices/${deviceId}/logs`, {
    params: {
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      level: params.level,
      facility: params.facility,
      source: params.source,
      search: params.search,
      start_time: params.start_time,
      end_time: params.end_time
    }
  })
  return unwrapPayload<LogListResponse>(payload)
}

/**
 * 获取所有日志列表
 */
export async function getAllLogs(params: LogQueryParams = {}): Promise<LogListResponse> {
  const payload = await api.get<unknown>(`${BASE_URL}`, {
    params: {
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      device_id: params.device_id,
      level: params.level,
      facility: params.facility,
      source: params.source,
      search: params.search,
      start_time: params.start_time,
      end_time: params.end_time
    }
  })
  return unwrapPayload<LogListResponse>(payload)
}

/**
 * 搜索日志
 */
export async function searchLogs(
  keyword: string,
  params: LogQueryParams = {}
): Promise<LogListResponse> {
  const payload = await api.get<unknown>(`${BASE_URL}/search`, {
    params: {
      keyword,
      skip: ((params.page || 1) - 1) * (params.page_size || 20),
      limit: params.page_size || 20,
      device_id: params.device_id,
      level: params.level,
      facility: params.facility,
      source: params.source,
    }
  })
  return unwrapPayload<LogListResponse>(payload)
}

/**
 * 获取最近日志
 */
export async function getRecentLogs(
  hours: number = 24,
  limit: number = 100
): Promise<DeviceLog[]> {
  const payload = await api.get<unknown>(`${BASE_URL}/recent`, {
    params: { hours, limit }
  })
  return unwrapPayload<DeviceLog[]>(payload)
}

/**
 * 采集设备日志
 */
export async function collectDeviceLogs(
  deviceId: number,
  request: LogCollectionRequest
): Promise<LogCollectionResponse> {
  const payload = await api.post<unknown>(
    `${BASE_URL}/devices/${deviceId}/logs/collect`,
    request
  )
  return unwrapPayload<LogCollectionResponse>(payload)
}

/**
 * 批量采集日志
 */
export async function batchCollectLogs(
  deviceIds: number[],
  options: {
    logType?: string
    maxEntries?: number
    maxConcurrent?: number
  } = {}
): Promise<LogCollectionResponse> {
  const payload = await api.post<unknown>(`${BASE_URL}/batch-collect`, {
    device_ids: deviceIds,
    log_type: options.logType || 'system',
    max_entries: options.maxEntries,
    max_concurrent: options.maxConcurrent,
  })
  return unwrapPayload<LogCollectionResponse>(payload)
}

/**
 * 获取日志解析规则列表
 */
export async function getParsingRules(): Promise<LogParsingRule[]> {
  const payload = await api.get<unknown>(`${BASE_URL}/parsing-rules`)
  return unwrapPayload<LogParsingRule[]>(payload)
}

/**
 * 创建日志解析规则
 */
export async function createParsingRule(
  rule: Omit<LogParsingRule, 'id' | 'created_at' | 'updated_at'>
): Promise<LogParsingRule> {
  const payload = await api.post<unknown>(`${BASE_URL}/parsing-rules`, rule)
  return unwrapPayload<LogParsingRule>(payload)
}

/**
 * 更新日志解析规则
 */
export async function updateParsingRule(
  ruleId: number,
  rule: Partial<LogParsingRule>
): Promise<LogParsingRule> {
  const payload = await api.put<unknown>(`${BASE_URL}/parsing-rules/${ruleId}`, rule)
  return unwrapPayload<LogParsingRule>(payload)
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
  const payload = await api.post<unknown>(`${BASE_URL}/batch-delete`, {
    log_ids: logIds
  })
  return unwrapPayload<{ deleted_count: number }>(payload)
}

/**
 * 导出日志
 */
export async function exportLogs(params: LogExportParams): Promise<Blob> {
  // NOTE: 后端导出接口返回的是文件流（CSV/XLSX），不能走 api-client 的 JSON 解析。
  const apiOrigin = getApiOrigin()
  const searchParams = new URLSearchParams()

  if (params.device_id) searchParams.append('device_id', String(params.device_id))
  if (params.level) searchParams.append('level', String(params.level))
  if (params.facility) searchParams.append('facility', String(params.facility))
  if (params.source) searchParams.append('source', String(params.source))
  if (params.search) searchParams.append('search', String(params.search))
  if (params.start_time) searchParams.append('start_time', String(params.start_time))
  if (params.end_time) searchParams.append('end_time', String(params.end_time))

  if (Array.isArray(params.device_ids) && params.device_ids.length > 0) {
    searchParams.append('device_ids', params.device_ids.join(','))
  }
  if (params.format) searchParams.append('format', String(params.format))
  if (typeof params.include_raw === 'boolean') searchParams.append('include_raw', String(params.include_raw))
  if (typeof params.include_stats === 'boolean') searchParams.append('include_stats', String(params.include_stats))

  const url = `${apiOrigin}${API_PREFIX}/logs/export${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const token = TokenManager.getAccessToken() || ''

  const response = await fetch(url, {
    headers: { Authorization: token ? `Bearer ${token}` : '' },
  })

  if (!response.ok) {
    throw new Error('导出失败')
  }

  return response.blob()
}
