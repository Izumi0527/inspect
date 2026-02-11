
import { api, ApiClientError } from '@/lib/api-client'
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
  ip_address: string
  device_type: string
  vendor?: string
  model?: string
  group_id?: number | null
  status?: string
  is_active?: boolean
  location?: string
  last_seen?: string
  uptime?: number | string
  cpu_usage?: number
  memory_usage?: number
  network_traffic?: number
  alert_count?: number
  description?: string
  snmp_community?: string
  snmp_version?: string
  snmp_port?: number | null
  cli_protocol?: string
  ssh_username?: string
  ssh_password?: string
  ssh_port?: number | null
  telnet_username?: string
  telnet_port?: number | null
  enable_password?: string
  icmp_status?: string | null
  snmp_status?: string | null
  response_time?: number | null
  last_probe_time?: string | null
  temperature?: number | null
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

interface DeviceCreateRequestDto {
  name: string
  ip_address: string
  device_type: string
  vendor: string
  model?: string
  location?: string
  group_id?: number
  snmp_community?: string
  snmp_version?: string
  cli_protocol?: string
  ssh_username?: string
  ssh_password?: string
  ssh_port?: number
  telnet_username?: string
  telnet_password?: string
  telnet_port?: number
  enable_password?: string
  description?: string
  tags?: Record<string, unknown> | string | null
}

interface DeviceBatchImportResponseDto {
  message?: string
  imported_count?: number
  skipped_count?: number
  imported_devices?: DeviceDto[]
  skipped_devices?: Array<{
    ip_address?: string
    reason?: string
  }>
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

const isApiResponse = <T>(candidate: unknown): candidate is ApiResponse<T> =>
  typeof candidate === 'object' &&
  candidate !== null &&
  'success' in (candidate as Record<string, unknown>) &&
  'data' in (candidate as Record<string, unknown>)

const isDeviceBatchImportResponse = (candidate: unknown): candidate is DeviceBatchImportResponseDto =>
  isObject(candidate) &&
  typeof (candidate as Record<string, unknown>).imported_count === 'number' &&
  typeof (candidate as Record<string, unknown>).skipped_count === 'number'

interface FastApiValidationErrorItem {
  loc?: unknown
  msg?: unknown
  type?: unknown
}

const parseFastApiValidationErrors = (
  detail: unknown,
  devices: DeviceImportData[]
): { message: string; errors: ImportResult['errors'] } => {
  if (!Array.isArray(detail)) {
    return {
      message: '设备导入失败：数据校验未通过',
      errors: devices.slice(0, 1).map(data => ({ row: 0, data, error: '数据校验未通过' })),
    }
  }

  const fieldLabels: Record<string, string> = {
    name: '设备名称',
    ip_address: 'IP 地址',
    device_type: '设备类型',
    vendor: '厂商',
    snmp_community: 'SNMP 团体字符串',
    ssh_username: 'SSH 用户名',
    ssh_password: 'SSH 密码',
  }

  const indexedMessages = new Map<number, string[]>()
  const generalMessages: string[] = []

  for (const item of detail) {
    const candidate = item as FastApiValidationErrorItem
    const loc = candidate?.loc
    const msg = typeof candidate?.msg === 'string' ? candidate.msg : '数据校验失败'

    if (Array.isArray(loc)) {
      const devicesPos = loc.findIndex(part => part === 'devices')
      const maybeIndex = devicesPos >= 0 ? loc[devicesPos + 1] : undefined
      const maybeField = devicesPos >= 0 ? loc[devicesPos + 2] : undefined

      if (typeof maybeIndex === 'number') {
        const fieldKey = typeof maybeField === 'string' ? maybeField : ''
        const label = fieldLabels[fieldKey] ?? fieldKey ?? ''
        const finalMsg = label ? `${label}：${msg}` : msg
        const existing = indexedMessages.get(maybeIndex) ?? []
        existing.push(finalMsg)
        indexedMessages.set(maybeIndex, existing)
        continue
      }
    }

    generalMessages.push(msg)
  }

  const errors: ImportResult['errors'] = []

  for (const [index, messages] of indexedMessages.entries()) {
    const data =
      devices[index] ??
      devices[0] ??
      ({ name: '', ip: '', device_type: 'switch' } as DeviceImportData)

    errors.push({
      row: index + 2,
      data,
      error: Array.from(new Set(messages)).join('；'),
    })
  }

  if (errors.length === 0) {
    errors.push(
      ...devices.slice(0, 1).map(data => ({
        row: 0,
        data,
        error: generalMessages[0] ?? '数据校验未通过',
      }))
    )
  }

  return {
    message: '设备导入失败：数据校验未通过',
    errors,
  }
}

const mapImportDeviceTypeToBackend = (value: DeviceImportData['device_type']): string => {
  // 后端模型/枚举使用 ap；前端使用 wireless_ap
  if (value === 'wireless_ap') return 'ap'
  return value
}

const mapImportDeviceToBackendCreate = (device: DeviceImportData): DeviceCreateRequestDto => {
  const vendor = typeof device.vendor === 'string' ? device.vendor.trim() : ''

  return {
    name: device.name,
    ip_address: device.ip.trim(),
    device_type: mapImportDeviceTypeToBackend(device.device_type),
    vendor: vendor || 'other',
    location: device.location?.trim() || undefined,
    description: device.description?.trim() || undefined,
    snmp_community: device.snmp_community?.trim() || undefined,
    ssh_username: device.ssh_username?.trim() || undefined,
    ssh_password: device.ssh_password || undefined,
  }
}

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

  // cli_protocol: 优先使用后端顶层字段，其次从 tags 中读取
  const cliProtocol = (dto.cli_protocol || cliConfig?.cli_protocol as string || 'none') as Device['cli_protocol']

  // ssh_config: 从后端字段或 tags 中构建
  const sshConfig: Device['ssh_config'] = (cliConfig?.ssh_config as Device['ssh_config']) || {
    username: dto.ssh_username || '',
    password: dto.ssh_password || '',
    port: dto.ssh_port || 22,
  }

  // telnet_config: 优先从后端顶层字段构建，其次从 tags 中读取
  const telnetConfigFromTags = cliConfig?.telnet_config as Device['telnet_config']
  const telnetConfig: Device['telnet_config'] = (dto.telnet_username || telnetConfigFromTags?.username)
    ? {
        username: dto.telnet_username || telnetConfigFromTags?.username || '',
        password: telnetConfigFromTags?.password || '',
        port: dto.telnet_port || telnetConfigFromTags?.port || 23,
        enable_password: dto.enable_password || telnetConfigFromTags?.enable_password || '',
      }
    : telnetConfigFromTags

  return {
    id: dto.id,
    name: dto.name,
    ip: dto.ip_address,
    device_type: dto.device_type as Device['device_type'],
    status: (dto.status as Device['status']) ?? 'unknown',
    location: dto.location ?? '',
    last_seen: dto.last_seen ?? '',
    uptime: dto.uptime != null ? String(dto.uptime) : '',
    cpu_usage: dto.cpu_usage ?? 0,
    memory_usage: dto.memory_usage ?? 0,
    network_traffic: dto.network_traffic ?? 0,
    alert_count: dto.alert_count ?? 0,
    description: dto.description ?? '',
    vendor: dto.vendor ?? '',
    snmp_community: dto.snmp_community ?? snmpConfigFromTags?.v2c_config?.community ?? '',
    snmp_version: dto.snmp_version ?? snmpConfigFromTags?.version,
    ssh_username: dto.ssh_username ?? '',
    ssh_password: dto.ssh_password ?? '',
    ssh_port: dto.ssh_port,
    icmp_status: (dto.icmp_status as Device['icmp_status']) ?? null,
    snmp_status: (dto.snmp_status as Device['snmp_status']) ?? null,
    response_time: dto.response_time ?? null,
    last_probe_time: dto.last_probe_time ?? null,
    snmp_config: snmpConfigFromTags,
    ssh_config: sshConfig,
    telnet_config: telnetConfig,
    cli_protocol: cliProtocol,
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

export interface FetchDevicesResult {
  devices: Device[]
  total: number
  page: number
  pageSize: number
}

export async function fetchDevices(filters?: DeviceFilters): Promise<FetchDevicesResult> {
  try {
    const payload = await api.get<unknown>(`/devices${buildQueryString(filters)}`)

    // 格式1: 分页响应 {devices: [...], total: N, page: N, page_size: N}
    if (isObject(payload) && 'total' in payload) {
      const obj = payload as Record<string, unknown>
      const dtos = Array.isArray(obj.devices)
        ? (obj.devices as unknown[]).filter(isDeviceDto)
        : []
      return {
        devices: dtos.map(mapDevice),
        total: typeof obj.total === 'number' ? obj.total : dtos.length,
        page: typeof obj.page === 'number' ? obj.page : 1,
        pageSize: typeof obj.page_size === 'number' ? obj.page_size : dtos.length,
      }
    }

    // 格式2: 兼容旧格式（纯数组）
    const dtos = extractDevices(payload)
    return {
      devices: dtos.map(mapDevice),
      total: dtos.length,
      page: 1,
      pageSize: dtos.length,
    }
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
      if (isApiResponse<DeviceDto>(payload)) {
        if (payload.success && payload.data) {
          return mapDevice(payload.data)
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
      const apiResponse = payload as unknown as ApiResponse<DeviceDto>
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
      const apiResponse = payload as unknown as ApiResponse<DeviceDto>
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
    if (isApiResponse<unknown>(payload)) {
      return payload.success
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

export async function batchDeleteDevices(deviceIds: number[]): Promise<{
  success: boolean
  message: string
  deleted_count: number
  failed_count: number
}> {
  const payload = await api.post<unknown>('/devices/batch-delete', deviceIds)

  if (isObject(payload)) {
    return {
      success: (payload as Record<string, unknown>).success === true,
      message: String((payload as Record<string, unknown>).message ?? '批量删除完成'),
      deleted_count: Number((payload as Record<string, unknown>).deleted_count ?? 0),
      failed_count: Number((payload as Record<string, unknown>).failed_count ?? 0),
    }
  }

  return {
    success: false,
    message: '批量删除失败',
    deleted_count: 0,
    failed_count: deviceIds.length,
  }
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
    const requestDevices = devices.map(mapImportDeviceToBackendCreate)

    const payload = await api.post<unknown>('/devices/batch-import', {
      devices: requestDevices,
      auto_detect: true,
      skip_duplicates: true,
    })

    const unwrapped = unwrapPayload<unknown>(payload) ?? payload

    // 优先匹配后端当前实现：直出 DeviceBatchImportResponse（无 ApiResponse 包装）
    if (isDeviceBatchImportResponse(unwrapped)) {
      const skipped = unwrapped.skipped_devices ?? []
      const errors = skipped.map((item, index) => {
        const ipAddress = item.ip_address?.trim() ?? ''
        const matched = devices.find(d => d.ip.trim() === ipAddress)
        const fallback = devices[0] ?? ({ name: '', ip: ipAddress, device_type: 'switch' } as DeviceImportData)

        return {
          row: index + 1,
          data: matched ?? fallback,
          error: item.reason ?? '已跳过',
        }
      })

      return {
        success: true,
        imported_count: unwrapped.imported_count ?? 0,
        skipped_count: unwrapped.skipped_count ?? 0,
        errors,
        message: unwrapped.message ?? '设备导入完成',
      }
    }

    // 兼容：后端若返回 ImportResponseDto 或使用 ApiResponse 包装
    if (isObject(unwrapped) && ('imported_count' in unwrapped || 'skipped_count' in unwrapped)) {
      const response = unwrapped as ImportResponseDto
      const errors = response.errors?.map((error, index) => ({
        row: error.row ?? index + 1,
        data: devices[error.row ?? 0] ?? devices[0] ?? ({ name: '', ip: '', device_type: 'switch' } as DeviceImportData),
        error: error.error ?? '导入失败',
      })) ?? []

      return {
        success: response.success ?? true,
        imported_count: response.imported_count ?? 0,
        skipped_count: response.skipped_count ?? 0,
        errors,
        message: response.message ?? '设备导入完成',
      }
    }

    return {
      success: false,
      imported_count: 0,
      skipped_count: 0,
      errors: devices.slice(0, 1).map(data => ({
        row: 0,
        data,
        error: '设备导入失败：响应格式不正确',
      })),
      message: '设备导入失败',
    }
  } catch (error) {
    console.error('设备导入失败:', error)

    if (error instanceof ApiClientError) {
      if (error.status === 422) {
        const parsed = parseFastApiValidationErrors(error.detail, devices)
        return {
          success: false,
          imported_count: 0,
          skipped_count: 0,
          errors: parsed.errors,
          message: parsed.message,
        }
      }

      return {
        success: false,
        imported_count: 0,
        skipped_count: 0,
        errors: devices.slice(0, 1).map(data => ({
          row: 0,
          data,
          error: error.message,
        })),
        message: error.message,
      }
    }

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
  // 注意: 后端实际路由是 /devices/statistics 而不是 /devices/stats
  const payload = await api.get<unknown>('/devices/statistics')

  // 兼容两种响应格式
  if (isObject(payload)) {
    // 格式1: 标准 ApiResponse
    if ('success' in payload && 'data' in payload) {
      const apiResponse = payload as unknown as ApiResponse<Record<string, unknown>>
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
      const apiResponse = payload as unknown as ApiResponse<Record<string, unknown>>
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
      const apiResponse = payload as unknown as ApiResponse<Record<string, unknown>>
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


/**
 * 探测单个设备的连接状态
 */
export async function probeDevice(deviceId: number): Promise<import('../types').DeviceProbeResult> {
  try {
    const response = await api.post<import('../types').DeviceProbeResult>(
      `/devices/${deviceId}/probe`
    )
    return response
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new Error(error.message || '探测设备失败')
    }
    throw error
  }
}

/**
 * 批量探测设备连接状态
 */
export async function batchProbeDevices(
  deviceIds: number[],
  maxConcurrent = 20
): Promise<import('../types').DeviceBatchProbeResponse> {
  try {
    const response = await api.post<import('../types').DeviceBatchProbeResponse>(
      '/devices/batch-probe',
      {
        device_ids: deviceIds,
        max_concurrent: maxConcurrent
      }
    )
    return response
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new Error(error.message || '批量探测设备失败')
    }
    throw error
  }
}
