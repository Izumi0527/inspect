
import { api, TokenManager } from '@/lib/api-client'
import {
  Alert,
  AlertQueryParams,
  AlertPaginatedResponse,
  AlertStats,
  BulkAlertAction,
  AlertSeverity,
  AlertStatus,
} from '../types'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface AlertDto {
  id: string
  title: string
  description: string
  device: string
  severity: AlertSeverity
  status: AlertStatus
  timestamp: string
  assignee?: string
  category?: string
  resolution?: string
  acknowledged_at?: string
  resolved_at?: string
  created_at?: string
  updated_at?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

interface AlertsListDto {
  alerts?: AlertDto[]
  total?: number
  pages?: number
  page?: number
  page_size?: number
  current_page?: number
  has_next?: boolean
  has_prev?: boolean
}

interface AlertStatsDto {
  total?: number
  critical?: number
  warning?: number
  info?: number
  active?: number
  acknowledged?: number
  resolved?: number
  by_category?: Record<string, number>
  by_device?: Record<string, number>
  trends?: {
    today?: number
    yesterday?: number
    change?: number
    daily?: Array<{ date: string; critical: number; warning: number; info: number }>
    hourly?: Array<{ hour: number; count: number }>
  }
}

interface RecentAlertDto {
  id: string
  title: string
  timestamp: string
  severity: AlertSeverity
  device?: string
}

interface BulkActionResponseDto {
  success: boolean
}

const toDate = (value?: string): Date | undefined => (value ? new Date(value) : undefined)

const toJsonValue = (value: unknown): JsonValue => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item))
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, JsonValue> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      result[key] = toJsonValue(val)
    })
    return result
  }
  return String(value)
}

const transformAlert = (dto: AlertDto): Alert => ({
  id: dto.id,
  title: dto.title,
  description: dto.description,
  device: dto.device,
  severity: dto.severity,
  status: dto.status,
  timestamp: dto.timestamp,
  assignee: dto.assignee,
  category: dto.category ?? '未分类',
  resolution: dto.resolution,
  createdAt: toDate(dto.created_at ?? dto.timestamp),
  updatedAt: toDate(dto.updated_at),
  acknowledgedAt: toDate(dto.acknowledged_at),
  resolvedAt: toDate(dto.resolved_at),
  tags: dto.tags ?? [],
  metadata: dto.metadata ?? {},
})

const buildQueryParams = (params?: AlertQueryParams) => {
  if (!params) return undefined

  const query: Record<string, string | number | boolean | Array<string | number> | undefined> = {}

  if (params.page !== undefined) query.page = params.page
  if (params.pageSize !== undefined) query.page_size = params.pageSize
  if (params.status && params.status.length) query.status = params.status
  if (params.severity && params.severity.length) query.severity = params.severity
  if (params.deviceIds && params.deviceIds.length) query.device_ids = params.deviceIds
  if (params.startDate) query.start_date = params.startDate
  if (params.endDate) query.end_date = params.endDate
  if (params.search) query.search = params.search
  if (params.category && params.category.length) query.category = params.category
  if (params.sortBy) query.sort_by = params.sortBy
  if (params.sortOrder) query.sort_order = params.sortOrder

  return query
}

export async function fetchAlerts(params?: AlertQueryParams): Promise<AlertPaginatedResponse> {
  const response = await api.alerts.list(buildQueryParams(params))
  const data: AlertsListDto = response ?? {}
  const alerts = data.alerts?.map(transformAlert) ?? []

  return {
    alerts,
    total: data.total ?? 0,
    page: data.page ?? params?.page ?? 1,
    pageSize: data.page_size ?? params?.pageSize ?? 20,
    currentPage: data.current_page ?? params?.page ?? 1,
    hasNext: data.has_next ?? false,
    hasPrev: data.has_prev ?? false,
  }
  // 移除try-catch，让错误向上传播到useAlerts hook进行统一处理
}

export async function fetchAlert(id: string): Promise<Alert | null> {
  try {
    const response = await api.alerts.get(id)
    if (!response) return null
    return transformAlert(response as AlertDto)
  } catch (error) {
    console.error('获取告警详情失败:', error)
    return null
  }
}

export async function acknowledgeAlert(id: string, assignee?: string, note?: string): Promise<boolean> {
  try {
    const payload: Record<string, JsonValue> = {
      note: note ?? '已确认处理',
    }
    if (assignee) {
      payload.assignee = assignee
    }
    const result = await api.alerts.acknowledge(id, payload)
    return (result as BulkActionResponseDto).success ?? true
  } catch (error) {
    console.error('确认告警失败:', error)
    throw error
  }
}

export async function resolveAlert(id: string, resolution?: string): Promise<boolean> {
  try {
    const payload: Record<string, JsonValue> = {}
    if (resolution) {
      payload.resolution = resolution
    }
    const result = await api.alerts.resolve(id, payload)
    return (result as BulkActionResponseDto).success ?? true
  } catch (error) {
    console.error('解决告警失败:', error)
    throw error
  }
}

export async function reactivateAlert(id: string, reason?: string): Promise<boolean> {
  try {
    const result = await api.post<BulkActionResponseDto>(`/alerts/${id}/reactivate`, {
      reason: reason ?? '问题重现，重新激活告警',
    })
    return result.success
  } catch (error) {
    console.error('重新激活告警失败:', error)
    throw error
  }
}

export async function deleteAlert(id: string): Promise<boolean> {
  try {
    await api.delete(`/alerts/${id}`)
    return true
  } catch (error) {
    console.error('删除告警失败:', error)
    throw error
  }
}

export async function bulkAlertAction(action: BulkAlertAction): Promise<boolean> {
  try {
    const payload: Record<string, JsonValue> = {
      action: action.action,
      alert_ids: action.alertIds,
    }
    if (action.params) {
      payload.params = toJsonValue(action.params)
    }
    if (action.assignee) {
      payload.assignee = action.assignee
    }
    if (action.comment) {
      payload.comment = action.comment
    }
    const result = await api.post<BulkActionResponseDto>('/alerts/bulk', payload)
    return result.success
  } catch (error) {
    console.error('批量操作告警失败:', error)
    throw error
  }
}

export async function fetchAlertStats(): Promise<AlertStats> {
  // 注意: 后端实际路由是 /alerts/statistics 而不是 /alerts/stats
  const response = await api.get<AlertStatsDto>('/alerts/statistics')
  const data = response ?? {}

  return {
    total: data.total ?? 0,
    critical: data.critical ?? 0,
    warning: data.warning ?? 0,
    info: data.info ?? 0,
    active: data.active ?? 0,
    acknowledged: data.acknowledged ?? 0,
    resolved: data.resolved ?? 0,
    byCategory: data.by_category ?? {},
    byDevice: data.by_device ?? {},
    trends: data.trends ?? {},
  }
  // 移除try-catch，让错误向上传播到useAlerts hook进行统一处理
}

export async function fetchRecentAlerts(limit: number = 5): Promise<Alert[]> {
  const response = await api.get<RecentAlertDto[]>(appendLimit('/alerts/recent', limit))
  const list = response ?? []
  return list.map(item =>
    transformAlert({
      id: item.id,
      title: item.title,
      description: '',
      device: item.device ?? '未知设备',
      severity: item.severity,
      status: 'active',
      timestamp: item.timestamp,
    })
  )
  // 移除try-catch，让错误向上传播到useAlerts hook进行统一处理
}

const appendLimit = (endpoint: string, limit: number) => {
  const search = new URLSearchParams({ limit: limit.toString() })
  return `${endpoint}?${search.toString()}`
}

export async function addAlertComment(id: string, comment: string): Promise<boolean> {
  try {
    const result = await api.post<{ success: boolean }>(`/alerts/${id}/comment`, {
      comment,
    })
    return result.success ?? true
  } catch (error) {
    console.error('添加备注失败:', error)
    throw error
  }
}

export async function exportAlerts(params?: AlertQueryParams): Promise<void> {
  const query = params ? buildQueryParams(params) : undefined
  const searchParams = new URLSearchParams()
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, String(item)))
      } else {
        searchParams.append(key, String(value))
      }
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const url = `${baseUrl}/api/v1/alerts/export${searchParams.toString() ? '?' + searchParams.toString() : ''}`

  try {
    const token = TokenManager.getAccessToken() || ''
    const response = await fetch(url, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })

    if (!response.ok) throw new Error('导出失败')

    const blob = await response.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `alerts_export_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    console.error('导出告警失败:', error)
    throw error
  }
}
