
import { api } from '@/lib/api-client'
import {
  DashboardData,
  DashboardStat,
  DashboardSectionKey,
  DashboardSectionStates,
  NetworkOverviewItem,
  NetworkOverviewStatus,
  RecentAlert,
} from '../types'
import type { Notification, NotificationSeverity, NotificationType } from '@/types/notification'

interface DashboardStatDto {
  title: string
  value: string | number
  change?: string
  iconName?: string
  iconColor?: string
  color?: string
  unit?: string // 需要格式化的值的单位（例如，带宽使用 "bps"）
}

interface RecentAlertDto {
  id: string | number
  device?: string
  message: string
  severity: string
  time: string
  category?: string
}

interface NetworkOverviewDto {
  name: string
  devices: number
  status: string
}

interface DashboardOverviewDto {
  stats?: DashboardStatDto[]
  recent_alerts?: RecentAlertDto[]
  network_overview?: NetworkOverviewDto[]
  last_updated?: string
  sections?: Record<string, unknown>
  permissions?: Record<string, unknown>
}

interface NotificationDto {
  id: string | number
  type: string
  title: string
  content: string
  timestamp: string
  read?: boolean
  severity?: string
  link?: string
  device?: string
}

interface DashboardNotificationsDto {
  notifications?: NotificationDto[]
  unread_count?: number
  last_updated?: string
}

export type DashboardNotificationsResult = {
  notifications: Notification[]
  unreadCount: number
  lastUpdated: Date
}

const DASHBOARD_SECTION_KEYS: DashboardSectionKey[] = [
  'stats',
  'statsDevices',
  'statsAlerts',
  'statsBandwidth',
  'statsInspections',
  'recentAlerts',
  'networkOverview',
]

const DASHBOARD_SECTION_FALLBACK_MESSAGES: Record<DashboardSectionKey, string> = {
  stats: '统计卡片加载失败',
  statsDevices: '设备统计加载失败',
  statsAlerts: '告警统计加载失败',
  statsBandwidth: '带宽统计加载失败',
  statsInspections: '巡检统计加载失败',
  recentAlerts: '最近告警加载失败',
  networkOverview: '网络概览加载失败',
}

export type DashboardNotificationActionPayload =
  | { ids: string[] }
  | { all: true; window_limit?: number }

type DashboardNotificationActionResponse = {
  updated?: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const unwrapPayload = <T>(payload: unknown): T | undefined => {
  if (!isObject(payload)) return undefined

  if ('success' in payload && payload.success === true && 'data' in payload) {
    return payload.data as T
  }

  if ('data' in payload) {
    return unwrapPayload<T>(payload.data)
  }

  return payload as T
}

const ensureArray = <T>(value: unknown): T[] | undefined => {
  if (Array.isArray(value)) {
    return value as T[]
  }
  return undefined
}

const normalizeDashboardSectionStatus = (
  key: DashboardSectionKey,
  value: unknown
): DashboardSectionStates[DashboardSectionKey] => {
  if (!isObject(value)) {
    return {
      ok: false,
      message: DASHBOARD_SECTION_FALLBACK_MESSAGES[key],
    }
  }

  const ok = value.ok === true
  const limitedByPermission = value.limitedByPermission === true
  const requiredPermission =
    typeof value.requiredPermission === 'string' ? value.requiredPermission.trim() : ''
  const message =
    typeof value.message === 'string' && value.message.trim() !== ''
      ? value.message.trim()
      : ok || limitedByPermission
        ? undefined
        : DASHBOARD_SECTION_FALLBACK_MESSAGES[key]

  return {
    ok: limitedByPermission ? true : ok,
    message,
    limitedByPermission: limitedByPermission ? true : undefined,
    requiredPermission: requiredPermission !== '' ? requiredPermission : undefined,
  }
}

const createDefaultDashboardSections = (): DashboardSectionStates => ({
  stats: { ok: true },
  statsDevices: { ok: true },
  statsAlerts: { ok: true },
  statsBandwidth: { ok: true },
  statsInspections: { ok: true },
  recentAlerts: { ok: true },
  networkOverview: { ok: true },
})

const normalizeDashboardSections = (value: unknown): DashboardSectionStates => {
  if (!isObject(value)) {
    return createDefaultDashboardSections()
  }

  const result = createDefaultDashboardSections()
  DASHBOARD_SECTION_KEYS.forEach((key) => {
    if (key in value) {
      result[key] = normalizeDashboardSectionStatus(key, value[key])
    }
  })
  return result
}

const normalizeDashboardPermissions = (value: unknown) => {
  const raw = isObject(value) ? value : {}
  return {
    devices: raw.devices === true,
    alerts: raw.alerts === true,
    monitoring: raw.monitoring === true,
    inspections: raw.inspections === true,
  }
}

const severityMap: Record<string, RecentAlert['severity']> = {
  critical: 'high',
  high: 'high',
  warning: 'medium',
  medium: 'medium',
  info: 'low',
  low: 'low',
}

const toRecentAlert = (dto: RecentAlertDto): RecentAlert => ({
  id: Number(dto.id),
  device: dto.device ?? '未知设备',
  message: dto.message,
  severity: severityMap[dto.severity] ?? 'low',
  time: dto.time,
  category: dto.category,
})

const normalizeNetworkOverviewStatus = (status: string): NetworkOverviewStatus => {
  switch (status) {
    case 'healthy':
    case 'normal':
    case 'warning':
    case 'critical':
      return status
    default:
      return 'unknown'
  }
}

const toNetworkOverviewItem = (dto: NetworkOverviewDto): NetworkOverviewItem => {
  const status = normalizeNetworkOverviewStatus(dto.status)

  return {
    title: dto.name,
    description: `${dto.devices} 台设备`,
    count: dto.devices,
    iconName: getIconForNetworkType(dto.name),
    gradient: getGradientForStatus(status),
    status,
  }
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const payload = await api.get<unknown>('/dashboard/overview')
  const overview = unwrapPayload<DashboardOverviewDto>(payload)

  if (!overview || !isObject(overview)) {
    throw new Error('仪表板响应格式无效')
  }

  return {
    stats: ensureArray<DashboardStatDto>(overview.stats)?.map(toDashboardStat) ?? getEmptyStatsData(),
    recentAlerts: ensureArray<RecentAlertDto>(overview.recent_alerts)?.map(toRecentAlert) ?? [],
    networkOverview: ensureArray<NetworkOverviewDto>(overview.network_overview)?.map(toNetworkOverviewItem) ?? [],
    lastUpdated: typeof overview.last_updated === 'string' ? new Date(overview.last_updated) : new Date(),
    sections: normalizeDashboardSections(overview.sections),
    permissions: normalizeDashboardPermissions(overview.permissions),
  }
}

export async function fetchRecentAlerts(limit: number = 5): Promise<RecentAlert[]> {
  try {
    const payload = await api.get<unknown>(appendLimit('/dashboard/recent-alerts', limit))
    const list = unwrapPayload<RecentAlertDto[] | { alerts?: RecentAlertDto[] }>(payload)

    const alerts = Array.isArray(list)
      ? list
      : (isObject(list) ? ensureArray<RecentAlertDto>(list.alerts) : undefined)

    if (!alerts) {
      return []
    }

    return alerts.map(toRecentAlert)
  } catch (error) {
    console.error('获取最近告警失败:', error)
    return []
  }
}

export async function fetchNetworkOverview(): Promise<NetworkOverviewItem[]> {
  try {
    const payload = await api.get<unknown>('/dashboard/network-overview')
    const overview = unwrapPayload<NetworkOverviewDto[] | { network_overview?: NetworkOverviewDto[] }>(payload)

    const items = Array.isArray(overview)
      ? overview
      : (isObject(overview) ? ensureArray<NetworkOverviewDto>(overview.network_overview) : undefined)

    if (!items) {
      return []
    }

    return items.map(toNetworkOverviewItem)
  } catch (error) {
    console.error('获取网络概览失败:', error)
    return []
  }
}

const normalizeNotificationSeverity = (value: unknown): NotificationSeverity => {
  if (value === 'critical' || value === 'warning' || value === 'info' || value === 'success') {
    return value
  }
  return 'info'
}

const normalizeNotificationType = (value: unknown): NotificationType => {
  if (value === 'alert' || value === 'system') {
    return value
  }
  return 'system'
}

const toNotification = (dto: NotificationDto): Notification => ({
  id: String(dto.id),
  type: normalizeNotificationType(dto.type),
  title: dto.title,
  content: dto.content,
  timestamp: dto.timestamp,
  read: Boolean(dto.read),
  severity: dto.severity ? normalizeNotificationSeverity(dto.severity) : undefined,
  link: typeof dto.link === 'string' ? dto.link : undefined,
  device: typeof dto.device === 'string' ? dto.device : undefined,
})

export async function fetchDashboardNotifications(limit: number = 20): Promise<Notification[]> {
  try {
    const payload = await api.get<unknown>(appendLimit('/dashboard/notifications', limit))
    const dto = unwrapPayload<DashboardNotificationsDto | NotificationDto[]>(payload)

    const list = Array.isArray(dto)
      ? dto
      : (isObject(dto) ? ensureArray<NotificationDto>(dto.notifications) : undefined)

    if (!list) {
      return []
    }

    return list.map(toNotification)
  } catch (error) {
    console.error('获取通知失败:', error)
    return []
  }
}

export async function fetchDashboardNotificationsWithMeta(limit: number = 20): Promise<DashboardNotificationsResult> {
  const payload = await api.get<unknown>(appendLimit('/dashboard/notifications', limit))
  const dto = unwrapPayload<DashboardNotificationsDto | NotificationDto[]>(payload)

  if (Array.isArray(dto)) {
    const notifications = dto.map(toNotification)
    const unreadCount = notifications.filter((n) => !n.read).length
    return {
      notifications,
      unreadCount,
      lastUpdated: new Date(),
    }
  }

  if (!isObject(dto)) {
    throw new Error('通知响应格式无效')
  }

  const list = ensureArray<NotificationDto>(dto.notifications)
  const notifications = (list ?? []).map(toNotification)

  const unreadCountValue =
    typeof dto.unread_count === 'number'
      ? dto.unread_count
      : notifications.filter((n) => !n.read).length

  const lastUpdated =
    typeof dto.last_updated === 'string' && dto.last_updated
      ? new Date(dto.last_updated)
      : new Date()

  return {
    notifications,
    unreadCount: unreadCountValue,
    lastUpdated,
  }
}

export async function markDashboardNotificationsRead(payload: DashboardNotificationActionPayload): Promise<{ updated: number }> {
  const resp = await api.post<unknown>('/dashboard/notifications/read', payload)
  const dto = unwrapPayload<DashboardNotificationActionResponse>(resp)

  return {
    updated: typeof dto?.updated === 'number' ? dto.updated : 0,
  }
}

export async function dismissDashboardNotifications(payload: DashboardNotificationActionPayload): Promise<{ updated: number }> {
  const resp = await api.post<unknown>('/dashboard/notifications/dismiss', payload)
  const dto = unwrapPayload<DashboardNotificationActionResponse>(resp)

  return {
    updated: typeof dto?.updated === 'number' ? dto.updated : 0,
  }
}

export async function performDeviceScan(subnet: string = '192.168.1.0/24'): Promise<Record<string, unknown>> {
  return api.post('/devices/scan', {
    target_network: subnet,
    scan_type: 'ping',
    port_scan: false,
    snmp_scan: false,
    deep_scan: false
  })
}

export async function generateReport(
  reportType: 'inspection-summary' | 'device-health' | 'trend-analysis' = 'inspection-summary'
): Promise<Record<string, unknown>> {
  // 统一走后端通用端点：POST /api/v1/reports/generate
  // 注意：该端点请求体为 snake_case（见后端 handlers.reportGenerateRequest）
  const now = new Date()
  const endTime = now.toISOString()
  const startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const reportTypeMap = {
    'inspection-summary': {
      name: '巡检汇总报表',
      report_type: 'inspection_summary',
      custom_config: {},
    },
    'device-health': {
      name: '设备健康报表',
      report_type: 'performance',
      custom_config: {},
    },
    'trend-analysis': {
      name: '趋势分析报表',
      report_type: 'trend',
      custom_config: {
        include_predictions: true,
        granularity: 'day',
      },
    },
  } as const

  const config = reportTypeMap[reportType]

  return api.post('/reports/generate', {
    name: config.name,
    report_type: config.report_type,
    start_time: startTime,
    end_time: endTime,
    device_ids: [],
    include_charts: true,
    include_details: true,
    custom_config: config.custom_config,
    format: 'pdf',
    category: 'weekly',
  })
}

export async function searchDevices(query: string): Promise<Record<string, unknown>[]> {
  try {
    const payload = await api.get<unknown>(`/devices/search?q=${encodeURIComponent(query)}&limit=10`)
    const list = unwrapPayload<Record<string, unknown>[] | { devices?: Record<string, unknown>[] }>(payload)

    if (Array.isArray(list)) {
      return list
    }

    if (isObject(list) && Array.isArray(list.devices)) {
      return list.devices as Record<string, unknown>[]
    }

    return []
  } catch (error) {
    console.error('搜索设备失败:', error)
    return []
  }
}

const appendLimit = (endpoint: string, limit: number) => {
  const params = new URLSearchParams({ limit: String(limit) })
  return `${endpoint}?${params.toString()}`
}

const toDashboardStat = (dto: DashboardStatDto): DashboardStat => ({
  title: dto.title,
  value: String(dto.value ?? '-'),
  change: dto.change ?? '',
  iconName: dto.iconName ?? 'Activity',
  iconColor: dto.iconColor ?? 'text-gray-400',
  color: dto.color ?? 'gray',
  unit: dto.unit, // 传递单位字段供前端格式化
})

const getEmptyStatsData = (): DashboardStat[] => [
  {
    title: '在线设备',
    value: '-',
    change: '',
    iconName: 'Monitor',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
  {
    title: '活跃告警',
    value: '-',
    change: '',
    iconName: 'AlertTriangle',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
  {
    title: '上行流量',
    value: '-',
    change: '',
    iconName: 'Upload',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
  {
    title: '下行流量',
    value: '-',
    change: '',
    iconName: 'Download',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
  {
    title: '巡检成功率',
    value: '-',
    change: '',
    iconName: 'ClipboardCheck',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
]

const getIconForNetworkType = (name: string): string => {
  if (name.includes('核心')) return 'Network'
  if (name.includes('接入')) return 'Monitor'
  if (name.includes('无线')) return 'Wifi'
  if (name.includes('安全') || name.includes('边界')) return 'Shield'
  return 'Server'
}

const getGradientForStatus = (status: string): string => {
  switch (status) {
    case 'healthy':
      return 'from-green-500 to-teal-600'
    case 'warning':
      return 'from-yellow-500 to-orange-600'
    case 'critical':
      return 'from-red-500 to-pink-600'
    default:
      return 'from-teal-500 to-cyan-600'
  }
}
