
import { api } from '@/lib/api-client'
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
  if (params.category) query.category = params.category
  if (params.sortBy) query.sort_by = params.sortBy
  if (params.sortOrder) query.sort_order = params.sortOrder

  return query
}

export async function fetchAlerts(params?: AlertQueryParams): Promise<AlertPaginatedResponse> {
  try {
    const response = await api.alerts.list(buildQueryParams(params))
    const data: AlertsListDto = response ?? {}
    const alerts = data.alerts?.map(transformAlert) ?? []

    return {
      alerts,
      total: data.total ?? alerts.length,
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? alerts.length,
      currentPage: data.current_page ?? params?.page ?? 1,
      hasNext: data.has_next ?? false,
      hasPrev: data.has_prev ?? false,
    }
  } catch (error) {
    console.error('获取告警列表失败:', error)
    return {
      alerts: getDefaultAlertsData(),
      total: 0,
      page: 1,
      pageSize: params?.pageSize ?? 20,
      currentPage: 1,
      hasNext: false,
      hasPrev: false,
    }
  }
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
  try {
    const response = await api.get<AlertStatsDto>('/alerts/stats')
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
  } catch (error) {
    console.error('获取告警统计失败:', error)
    return getDefaultAlertStats()
  }
}

export async function fetchRecentAlerts(limit: number = 5): Promise<Alert[]> {
  try {
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
  } catch (error) {
    console.error('获取最新告警失败:', error)
    return getDefaultRecentAlerts()
  }
}

const appendLimit = (endpoint: string, limit: number) => {
  const search = new URLSearchParams({ limit: limit.toString() })
  return `${endpoint}?${search.toString()}`
}

function getDefaultAlertsData(): Alert[] {
  return [
    {
      id: '1',
      title: 'CPU 使用率过高',
      description: '核心交换机 CPU 使用率达到 95%',
      device: "核心交换机-01",
      severity: 'critical',
      status: 'active',
      timestamp: '2024-01-20 14:30:25',
      category: '性能',
    },
    {
      id: '2',
      title: '端口状态异常',
      description: '路由器端口 GE0/0/1 状态变为 Down',
      device: '路由器-A3',
      severity: 'warning',
      status: 'acknowledged',
      timestamp: '2024-01-20 14:15:10',
      assignee: '张工',
      category: '连接',
    },
    {
      id: '3',
      title: '内存使用警告',
      description: '防火墙内存使用率超过 80%',
      device: '防火墙-02',
      severity: 'warning',
      status: 'active',
      timestamp: '2024-01-20 13:45:30',
      category: '性能',
    },
  ]
}

function getDefaultRecentAlerts(): Alert[] {
  return getDefaultAlertsData().slice(0, 5)
}

function getDefaultAlertStats(): AlertStats {
  return {
    total: 25,
    active: 12,
    acknowledged: 8,
    resolved: 5,
    critical: 3,
    warning: 15,
    info: 7,
    byCategory: {
      性能: 15,
      连接: 5,
      安全: 3,
      系统: 2,
    },
    byDevice: {
      '核心交换机-01': 8,
      '路由器-A3': 6,
      '防火墙-02': 4,
    },
    trends: {
      today: 5,
      yesterday: 8,
      change: -37.5,
      daily: [],
      hourly: [],
    },
  }
}
