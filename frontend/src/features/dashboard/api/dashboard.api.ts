
import { api } from '@/lib/api-client'
import {
  DashboardData,
  DashboardStat,
  NetworkOverviewItem,
  RecentAlert,
} from '../types'

interface DashboardStatDto {
  title: string
  value: string | number
  change?: string
  iconName?: string
  iconColor?: string
  color?: string
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
}

interface DashboardStatsDto {
  devices?: {
    online?: number
    offline?: number
    total?: number
    health_percentage?: number
  }
  alerts?: {
    total?: number
    critical?: number
    warning?: number
    resolved?: number
  }
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

const toNetworkOverviewItem = (dto: NetworkOverviewDto): NetworkOverviewItem => ({
  title: dto.name,
  description: `${dto.devices} 台设备`,
  count: dto.devices,
  iconName: getIconForNetworkType(dto.name),
  gradient: getGradientForStatus(dto.status),
})

export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const payload = await api.get<unknown>('/dashboard/overview')
    const overview = unwrapPayload<DashboardOverviewDto>(payload)

    if (!overview) {
      return getEmptyDashboardData()
    }

    return {
      stats: ensureArray<DashboardStatDto>(overview.stats)?.map(toDashboardStat) ?? getEmptyStatsData(),
      recentAlerts: ensureArray<RecentAlertDto>(overview.recent_alerts)?.map(toRecentAlert) ?? [],
      networkOverview: ensureArray<NetworkOverviewDto>(overview.network_overview)?.map(toNetworkOverviewItem) ?? [],
      lastUpdated: overview.last_updated ? new Date(overview.last_updated) : new Date(),
    }
  } catch (error) {
    console.warn('获取仪表板数据失败，使用空数据结构:', error)
    return getEmptyDashboardData()
  }
}

export async function fetchDashboardStats(): Promise<DashboardStat[]> {
  try {
    const payload = await api.get<unknown>('/dashboard/stats')
    const statsDto = unwrapPayload<DashboardStatsDto>(payload)

    if (!statsDto) {
      return getEmptyStatsData()
    }

    return buildDashboardStats(statsDto)
  } catch (error) {
    console.warn('获取统计数据失败，使用空数据结构:', error)
    return getEmptyStatsData()
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

export async function performDeviceScan(subnet?: string): Promise<Record<string, unknown>> {
  return api.post('/devices/scan', subnet ? { subnet } : undefined)
}

export async function performPerformanceTest(target: string): Promise<Record<string, unknown>> {
  return api.post('/performance/test', { target })
}

export async function generateReport<T>(type: string, params: Record<string, unknown>): Promise<T> {
  return api.post<T>(`/reports/generate/${type}`, params)
}

export async function searchDevices(query: string): Promise<Record<string, unknown>[]> {
  try {
    const payload = await api.get<unknown>(`/devices/search?q=${encodeURIComponent(query)}`)
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
})

const buildDashboardStats = (dto: DashboardStatsDto): DashboardStat[] => {
  const onlineDevices = dto.devices?.online ?? 0
  const totalDevices = dto.devices?.total ?? 0
  const healthPercentage = dto.devices?.health_percentage ?? 0
  const activeAlerts = dto.alerts?.total ?? 0
  const criticalAlerts = dto.alerts?.critical ?? 0

  return [
    {
      title: '在线设备',
      value: onlineDevices.toString(),
      change: totalDevices > 0 ? `${Math.round((onlineDevices / totalDevices) * 100)}% 在线` : '无数据',
      iconName: 'Monitor',
      iconColor: 'text-green-600',
      color: 'green',
    },
    {
      title: '活跃告警',
      value: activeAlerts.toString(),
      change: criticalAlerts > 0 ? `${criticalAlerts} 条严重告警` : '无严重告警',
      iconName: 'AlertTriangle',
      iconColor: criticalAlerts > 0 ? 'text-red-600' : 'text-yellow-600',
      color: criticalAlerts > 0 ? 'red' : 'yellow',
    },
    {
      title: '设备健康率',
      value: `${healthPercentage}%`,
      change: healthPercentage >= 95 ? '健康状况良好' : '需要关注',
      iconName: 'Shield',
      iconColor: 'text-blue-600',
      color: 'blue',
    },
    {
      title: '总设备数',
      value: totalDevices.toString(),
      change: totalDevices > 0 ? `${dto.devices?.offline ?? 0} 台离线` : '无设备',
      iconName: 'Server',
      iconColor: 'text-purple-600',
      color: 'purple',
    },
  ]
}

const getEmptyDashboardData = (): DashboardData => ({
  stats: getEmptyStatsData(),
  recentAlerts: [],
  networkOverview: [],
  lastUpdated: new Date(),
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
    title: '设备健康率',
    value: '-',
    change: '',
    iconName: 'Shield',
    iconColor: 'text-gray-400',
    color: 'gray',
  },
  {
    title: '总设备数',
    value: '-',
    change: '',
    iconName: 'Server',
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
      return 'from-blue-500 to-purple-600'
  }
}
