
import { api } from '@/lib/api-client'
import {
  Device,
  DeviceFilters,
  BulkActionType,
  BulkActionParams,
  BulkOperationResult,
  DeviceImportData,
  ImportResult,
  BulkUpdateParams,
} from '../types'
import { ApiResponse } from '@/lib/types/api-response.types'

interface DeviceDto {
  id: number
  name: string
  ip_address: string  // 修复：使用后端的ip_address字段
  device_type: string
  status?: string
  location?: string
  last_seen?: string
  uptime?: string
  cpu_usage?: number
  memory_usage?: number
  network_traffic?: number
  alert_count?: number
  description?: string
  snmp_community?: string
  ssh_username?: string
  ssh_password?: string
  ssh_port?: number
  tags?: Record<string, unknown> | string | null
  created_at?: string
  updated_at?: string
}

interface DeviceListDto {
  devices?: DeviceDto[]
  total?: number
  page?: number
  page_size?: number
}

interface BulkActionResponseDto {
  success?: boolean
  processed_count?: number
  failed_count?: number
  errors?: Array<{
    device_id?: number
    device_name?: string
    error?: string
  }>
  message?: string
}

interface ImportResponseDto {
  success?: boolean
  imported_count?: number
  skipped_count?: number
  errors?: Array<{
    row?: number
    data?: DeviceDto
    error?: string
  }>
  message?: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const unwrapPayload = <T>(payload: unknown): T | undefined => {
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

const isDeviceDto = (candidate: unknown): candidate is DeviceDto =>
  isObject(candidate) && typeof candidate.id === 'number' && typeof candidate.name === 'string' && typeof candidate.ip_address === 'string'

const mapDevice = (dto: DeviceDto): Device => {
  const parsedTags = (() => {
    if (!dto.tags) return null
    if (typeof dto.tags === 'string') {
      try {
        return JSON.parse(dto.tags) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return dto.tags as Record<string, unknown>
  })()

  const cliConfig = parsedTags?.cli_config as Record<string, unknown> | undefined
  const snmpConfigFromTags = parsedTags?.snmp_config as Device['snmp_config']

  return {
    id: dto.id,
    name: dto.name,
    ip: dto.ip_address,
    device_type: dto.device_type as Device['device_type'],
    status: (dto.status as Device['status']) ?? 'unknown',
    location: dto.location ?? '',
    last_seen: dto.last_seen ?? '',
    uptime: dto.uptime ?? '',
    cpu_usage: dto.cpu_usage ?? 0,
    memory_usage: dto.memory_usage ?? 0,
    network_traffic: dto.network_traffic ?? 0,
    alert_count: dto.alert_count ?? 0,
    description: dto.description ?? '',
    snmp_community: dto.snmp_community ?? snmpConfigFromTags?.v2c_config?.community ?? '',
    snmp_version: dto.snmp_version ?? snmpConfigFromTags?.version,
    ssh_username: dto.ssh_username ?? '',
    ssh_password: dto.ssh_password ?? '',
    ssh_port: dto.ssh_port,
    snmp_config: snmpConfigFromTags,
    ssh_config: cliConfig?.ssh_config as Device['ssh_config'],
    telnet_config: cliConfig?.telnet_config as Device['telnet_config'],
    cli_protocol: cliConfig?.cli_protocol as Device['cli_protocol'],
    tags: parsedTags,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
  }
}

const extractDevices = (payload: unknown): DeviceDto[] => {
  const unwrapped = unwrapPayload<DeviceDto[] | DeviceListDto>(payload)

  if (Array.isArray(unwrapped)) {
    return unwrapped.filter(isDeviceDto)
  }

  if (isObject(unwrapped) && Array.isArray(unwrapped.devices)) {
    return unwrapped.devices.filter(isDeviceDto)
  }

  if (Array.isArray((payload as DeviceListDto | undefined)?.devices)) {
    return ((payload as DeviceListDto).devices ?? []).filter(isDeviceDto)
  }

  return []
}

const buildQueryString = (filters?: DeviceFilters) => {
  if (!filters) return ''
  const params = new URLSearchParams()

  if (filters.status) params.append('status', filters.status)
  if (filters.device_type) params.append('device_type', filters.device_type)
  if (filters.location) params.append('location', filters.location)
  if (filters.search) params.append('search', filters.search)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.page_size) params.append('page_size', String(filters.page_size))

  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function fetchDevices(filters?: DeviceFilters): Promise<Device[]> {
  try {
    const payload = await api.get<unknown>(`/devices${buildQueryString(filters)}`)
    return extractDevices(payload).map(mapDevice)
  } catch (error) {
    console.error('获取设备列表失败:', error)
    throw error
  }
}

export async function fetchDevice(id: number): Promise<Device | null> {
  try {
    const payload = await api.get<unknown>(`/devices/${id}`)

    // 兼容两种响应格式
    if (isObject(payload)) {
      // 格式1: 标准 ApiResponse<DeviceDto>
      if ('success' in payload && 'data' in payload) {
        const apiResponse = payload as ApiResponse<DeviceDto>
        if (apiResponse.success && apiResponse.data) {
          return mapDevice(apiResponse.data)
        }
        return null
      }

      // 格式2: 直接返回设备对象 (后端当前格式)
      if (isDeviceDto(payload)) {
        return mapDevice(payload)
      }
    }

    return null
  } catch (error) {
    console.error('获取设备详情失败:', error)
    return null
  }
}

export async function createDevice(device: Omit<Device, 'id' | 'created_at' | 'updated_at'>): Promise<Device> {
  const payload = await api.post<unknown>('/devices', device)

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse<DeviceDto>
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as ApiResponse<DeviceDto>
      if (apiResponse.success && apiResponse.data) {
        return mapDevice(apiResponse.data)
      }
      throw new Error(apiResponse.message || '创建设备失败')
    }

    // 格式2: 直接返回设备对象 (后端当前格式)
    if (isDeviceDto(payload)) {
      return mapDevice(payload)
    }
  }

  throw new Error('创建设备失败：响应格式不正确')
}

export async function updateDevice(id: number, updates: Partial<Device>): Promise<Device> {
  const payload = await api.put<unknown>(`/devices/${id}`, updates)

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse<DeviceDto>
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as ApiResponse<DeviceDto>
      if (apiResponse.success && apiResponse.data) {
        return mapDevice(apiResponse.data)
      }
      throw new Error(apiResponse.message || '更新设备失败')
    }

    // 格式2: 直接返回设备对象 (后端当前格式)
    if (isDeviceDto(payload)) {
      return mapDevice(payload)
    }
  }

  throw new Error('更新设备失败：响应格式不正确')
}

export async function deleteDevice(id: number): Promise<boolean> {
  const payload = await api.delete<unknown>(`/devices/${id}`)

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse
    if ('success' in payload) {
      return (payload as ApiResponse<unknown>).success
    }

    // 格式2: 直接返回 {success: boolean} 或其他对象
    // DELETE 成功通常返回 204 No Content 或 200 OK，没有响应体
    // 如果能执行到这里说明请求成功了
    return true
  }

  // 如果 payload 为空（204 No Content），也视为成功
  if (payload === null || payload === undefined || payload === '') {
    return true
  }

  return false
}

const performBulkAction = async (
  endpoint: string,
  body: Record<string, unknown>
): Promise<BulkOperationResult> => {
  const payload = await api.post<ApiResponse<BulkActionResponseDto>>(endpoint, body)
  if (payload.success && payload.data?.success !== false) {
    return {
      success: true,
      processed_count: payload.data?.processed_count ?? 0,
      failed_count: payload.data?.failed_count ?? 0,
      errors: payload.data?.errors?.map(error => ({
        device_id: error.device_id,
        device_name: error.device_name,
        error: error.error ?? '未知错误',
      })) ?? [],
      message: payload.message ?? '操作成功',
    }
  }

  const message = payload.message ?? payload.data?.message ?? '操作失败'
  return {
    success: false,
    processed_count: payload.data?.processed_count ?? 0,
    failed_count: payload.data?.failed_count ?? 0,
    errors: payload.data?.errors?.map(error => ({
      device_id: error.device_id,
      device_name: error.device_name,
      error: error.error ?? message,
    })) ?? [],
    message,
  }
}

export async function bulkDeviceAction(
  action: BulkActionType,
  params?: BulkActionParams
): Promise<BulkOperationResult> {
  return performBulkAction('/devices/bulk-action', {
    action,
    ...(params ?? {}),
  })
}

export async function bulkUpdateDevices(params: BulkUpdateParams): Promise<BulkOperationResult> {
  return performBulkAction('/devices/batch-update', { ...params })
}

export async function bulkImportDevices(devices: DeviceImportData[]): Promise<ImportResult> {
  try {
    const payload = await api.post<ApiResponse<ImportResponseDto>>('/devices/batch-import', {
      devices,
      auto_detect: true,
      skip_duplicates: true,
    })

    if (payload.success && payload.data) {
      return {
        success: payload.data.success ?? true,
        imported_count: payload.data.imported_count ?? 0,
        skipped_count: payload.data.skipped_count ?? 0,
        errors: payload.data.errors?.map((error, index) => ({
          row: error.row ?? index,
          data: devices[error.row ?? 0] ?? devices[0],
          error: error.error ?? '导入失败',
        })) ?? [],
        message: payload.data.message ?? payload.message ?? '设备导入成功',
      }
    }

    return {
      success: false,
      imported_count: 0,
      skipped_count: 0,
      errors: payload.data?.errors?.map((error, index) => ({
        row: error.row ?? index,
        data: devices[error.row ?? 0] ?? devices[0],
        error: error.error ?? payload.message ?? '导入失败',
      })) ?? [],
      message: payload.message ?? '设备导入失败',
    }
  } catch (error) {
    console.error('设备导入失败:', error)
    return {
      success: false,
      imported_count: 0,
      skipped_count: 0,
      errors: devices.slice(0, 1).map(data => ({
        row: 0,
        data,
        error: error instanceof Error ? error.message : '导入失败',
      })),
      message: '设备导入失败',
    }
  }
}

export async function fetchDeviceStats(): Promise<Record<string, unknown>> {
  const payload = await api.get<unknown>('/devices/stats')

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as ApiResponse<Record<string, unknown>>
      if (apiResponse.success && apiResponse.data) {
        return apiResponse.data
      }
      throw new Error(apiResponse.message || '获取设备统计失败')
    }

    // 格式2: 直接返回统计对象 (后端当前格式)
    return payload as Record<string, unknown>
  }

  throw new Error('获取设备统计失败：响应格式不正确')
}

export async function healthCheckDevice(id: number): Promise<Record<string, unknown>> {
  const payload = await api.post<unknown>(`/devices/${id}/health-check`)

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as ApiResponse<Record<string, unknown>>
      if (apiResponse.success) {
        return apiResponse.data ?? {}
      }
      throw new Error(apiResponse.message || '设备健康检查失败')
    }

    // 格式2: 直接返回健康检查结果对象 (后端当前格式)
    return payload as Record<string, unknown>
  }

  return {}
}

export async function fetchDevicePerformance(
  id: number,
  timeRange?: string
): Promise<Record<string, unknown>> {
  const endpoint = appendQuery(`/devices/${id}/performance`, timeRange ? { time_range: timeRange } : undefined)
  const payload = await api.get<unknown>(endpoint)

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as ApiResponse<Record<string, unknown>>
      if (apiResponse.success && apiResponse.data) {
        return apiResponse.data
      }
      throw new Error(apiResponse.message || '获取设备性能数据失败')
    }

    // 格式2: 直接返回性能数据对象 (后端当前格式)
    return payload as Record<string, unknown>
  }

  throw new Error('获取设备性能数据失败：响应格式不正确')
}

const appendQuery = (endpoint: string, params?: Record<string, string | number | boolean | undefined>) => {
  if (!params) return endpoint
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, String(value))
    }
  })
  const query = searchParams.toString()
  return query ? `${endpoint}?${query}` : endpoint
}
