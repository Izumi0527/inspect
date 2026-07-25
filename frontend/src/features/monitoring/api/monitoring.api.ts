import { api, ApiClientError } from '@/lib/api-client'
import { formatDateTimeYMDHM } from '@/utils/formatters'
import {
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
  DeviceStatusDistribution,
  AvailabilityData,
  NetworkTrafficDataPoint,
  StatCardData,
  Alert,
  MonitoringDataV2,
  MonitoringDataEnvelope,
  MonitoringSectionKey,
  MonitoringSectionStates,
} from '../types'

/**
 * 监控模块 API 接口
 * 已连接真实后端API - 支持实时数据更新
 */

/** 后端监控端点的宽松响应记录（字段名跨后端版本存在别名，逐字段收窄取值） */
type RawRecord = Record<string, unknown>

/** unknown → 有限数值，失败回退 fallback */
function toNum(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** unknown → 非空字符串，失败回退 fallback */
function toStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

/** unknown → 可选字符串（非字符串返回 undefined） */
function toStrOpt(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeAlertSeverity(raw: unknown): Alert['severity'] {
  const normalized = String(raw ?? '').toLowerCase().trim()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'warning'
  if (normalized === 'info') return 'info'

  // 兼容后端/采集侧可能出现的级别
  if (
    normalized === 'fatal' ||
    normalized === 'emergency' ||
    normalized === 'error' ||
    normalized === 'high'
  ) {
    return 'critical'
  }
  if (normalized === 'warn' || normalized === 'medium') {
    return 'warning'
  }

  return 'info'
}

function formatAlertTime(raw: unknown): string {
  const date = raw instanceof Date ? raw : new Date(String(raw ?? ''))
  if (Number.isNaN(date.getTime())) {
    const fallback = String(raw ?? '').trim()
    return fallback !== '' ? fallback : '-'
  }
  return formatDateTimeYMDHM(date)
}

/**
 * 格式化带宽值（bps），自动选择合适的单位
 * @param bps - bits per second (比特每秒)
 * @returns 格式化后的字符串，如 "1.5 Kbps", "2.3 Mbps", "1.2 Gbps"
 *
 * 转换规则（使用1000进制，网络带宽标准）：
 * - 1001 bps → 1.00 Kbps (超过1000时进位)
 * - 1001 Kbps → 1.00 Mbps
 * - 1001 Mbps → 1.00 Gbps
 * - 1001 Gbps → 1.00 Tbps
 */
function formatBandwidthValue(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 bps'

  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  const k = 1000 // 网络带宽使用1000进制

  const rawIndex = Math.floor(Math.log(bps) / Math.log(k))
  const unitIndex = Math.min(Math.max(rawIndex, 0), units.length - 1)

  const value = bps / Math.pow(k, unitIndex)

  if (value >= 100) {
    return `${value.toFixed(0)} ${units[unitIndex]}`
  } else if (value >= 10) {
    return `${value.toFixed(1)} ${units[unitIndex]}`
  } else {
    return `${value.toFixed(2)} ${units[unitIndex]}`
  }
}

function resolveTimeRange(timeRange: string) {
  const now = new Date()
  const match = /^([0-9]+)([hdw])$/i.exec(timeRange.trim())
  const start = new Date(now)

  if (match) {
    const value = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    switch (unit) {
      case 'h':
        start.setHours(start.getHours() - value)
        break
      case 'd':
        start.setDate(start.getDate() - value)
        break
      case 'w':
        start.setDate(start.getDate() - value * 7)
        break
    }
  } else {
    start.setDate(start.getDate() - 1)
  }

  return {
    start: start.toISOString(),
    end: now.toISOString(),
  }
}

/**
 * 导出监控报告参数
 */
export interface ExportMonitoringReportParams {
  /** 导出格式 */
  format: 'pdf'
  /** 时间范围 */
  time_range: string
  /** 包含的部分 */
  sections: string[]
}

/**
 * 导出监控报告响应
 */
export interface ExportMonitoringReportResponse {
  /** 导出格式 */
  format: string
  /** 时间范围 */
  time_range: string
  /** 包含的部分 */
  sections: string[]
  /** 生成时间 */
  generated_at: string
  /** 下载链接 */
  download_url: string
  /** 下载票据（大文件下载优先使用 form POST，避免 blob 占用内存） */
  download_token?: string
  /** 票据下载地址（用于 form POST），未提供时可回退使用 download_url */
  download_form_url?: string
  /** 票据过期时间（RFC3339），仅用于展示/调试 */
  download_token_expires_at?: string
  /** 票据最大使用次数（用于兼容断点续传/重试） */
  download_token_max_uses?: number
  /** 状态 */
  status: string
}

export interface CheckMonitoringReportDownloadTokenResponse {
  valid: boolean
  message?: string
  filename?: string
  expires_at?: string
  remaining_uses?: number
}

/**
 * 导出监控报告
 * @param params - 导出参数
 * @returns 报告元数据
 */
export const exportMonitoringReport = async (
  params: ExportMonitoringReportParams
): Promise<ExportMonitoringReportResponse> => {
  return await api.post<ExportMonitoringReportResponse>('/monitoring/reports/export', params)
}

export const checkMonitoringReportDownloadToken = async (
  token: string
): Promise<CheckMonitoringReportDownloadTokenResponse> => {
  return await api.post<CheckMonitoringReportDownloadTokenResponse>(
    '/monitoring/reports/download/check',
    { token }
  )
}

/**
 * 获取系统性能历史数据
 * @param timeRange - 时间范围 (24h, 7d, 30d)
 * @returns 系统性能数据点数组
 */
export async function fetchSystemPerformanceHistory(
  timeRange: string = '24h'
): Promise<SystemPerformanceDataPoint[]> {
  try {
    const { start, end } = resolveTimeRange(timeRange)

    const response = await api.post('/monitoring/system/performance', {
      start_time: start,
      end_time: end,
      metrics: ['cpu_usage', 'memory_usage', 'network_traffic'],
    })

    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: RawRecord) => ({
        timestamp: toStr(point.timestamp || point.time, new Date().toISOString()),
        cpu: toNum(point.cpu_usage ?? point.cpu),
        memory: toNum(point.memory_usage ?? point.memory),
        network: toNum(point.network_traffic ?? point.network),
      }))
    }

    return []
  } catch (error) {
    console.error('获取系统性能历史失败:', error)
    throw error instanceof Error ? error : new Error('获取系统性能历史失败')
  }
}

/**
 * 获取设备温度历史数据
 * @param timeRange - 时间范围
 * @returns 温度历史数据点数组
 */
export async function fetchTemperatureHistory(
  timeRange: string = '24h'
): Promise<TemperatureDataPoint[]> {
  try {
    const { start, end } = resolveTimeRange(timeRange)

    const response = await api.post('/monitoring/devices/temperature', {
      start_time: start,
      end_time: end,
    })

    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: RawRecord) => ({
        timestamp: toStr(point.timestamp || point.time, new Date().toISOString()),
        devices: (point.devices || point.temperatures || {}) as TemperatureDataPoint['devices'],
      }))
    }

    return []
  } catch (error) {
    console.error('获取温度历史失败:', error)
    throw error instanceof Error ? error : new Error('获取温度历史失败')
  }
}

/**
 * 获取设备状态分布
 * @returns 设备状态分布统计
 */
export async function fetchDeviceStatusDistribution(): Promise<DeviceStatusDistribution> {
  try {
    const response = await api.get<RawRecord>('/monitoring/devices/distribution')

    return {
      healthy: toNum(response?.healthy ?? response?.normal),
      warning: toNum(response?.warning ?? response?.degraded),
      critical: toNum(response?.critical ?? response?.error ?? response?.down),
      offline: toNum(response?.offline ?? response?.inactive),
    }
  } catch (error) {
    console.error('获取设备状态分布失败:', error)
    throw error instanceof Error ? error : new Error('获取设备状态分布失败')
  }
}

/**
 * 获取整体可用性数据
 * @returns 可用性数据
 */
export async function fetchAvailabilityData(): Promise<AvailabilityData> {
  try {
    const response = await api.get<RawRecord>('/monitoring/availability')
    const trend = response?.trend

    return {
      current: toNum(response?.current ?? response?.availability),
      target: toNum(response?.target ?? response?.sla, 99.9),
      trend: trend === 'up' || trend === 'down' ? trend : 'stable',
      lastUpdate: toStr(response?.last_update ?? response?.lastUpdate, new Date().toISOString()),
    }
  } catch (error) {
    console.error('获取可用性数据失败:', error)
    throw error instanceof Error ? error : new Error('获取可用性数据失败')
  }
}

/**
 * 获取网络流量历史数据
 * @param timeRange - 时间范围
 * @returns 网络流量历史数据点数组
 */
export async function fetchNetworkTrafficHistory(
  timeRange: string = '24h'
): Promise<NetworkTrafficDataPoint[]> {
  try {
    const { start, end } = resolveTimeRange(timeRange)

    const response = await api.post('/monitoring/network/traffic/history', {
      start_time: start,
      end_time: end,
    })

    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: RawRecord) => ({
        timestamp: toStr(point.timestamp || point.time, new Date().toISOString()),
        inbound: toNum(point.inbound ?? point.in ?? point.rx),
        outbound: toNum(point.outbound ?? point.out ?? point.tx),
      }))
    }

    return []
  } catch (error) {
    console.error('获取网络流量历史失败:', error)
    throw error instanceof Error ? error : new Error('获取网络流量历史失败')
  }
}

/**
 * 获取统计卡片数据 (6 个关键指标)
 * @returns 统计卡片数据数组
 */
export async function fetchStatsV2(): Promise<StatCardData[]> {
  try {
    const response = await api.get<unknown>('/monitoring/stats')

    // 如果后端返回数组，直接使用
    if (Array.isArray(response)) {
      return response.map((stat: RawRecord, index: number) => ({
        id: stat.id ? String(stat.id) : `stat_${index}`,
        title: toStr(stat.title || stat.name),
        value: String(stat.value ?? '0'),
        change: toStrOpt(stat.change),
        trend:
          stat.trend === 'up' || stat.trend === 'down' || stat.trend === 'stable'
            ? stat.trend
            : undefined,
        icon: toStrOpt(stat.icon),
        color: toStrOpt(stat.color),
      }))
    }

    // 如果后端返回对象，转换为数组
    if (response && typeof response === 'object') {
      const record = response as RawRecord
      const formatPercentageValue = (value: unknown): number => {
        return Number(value ?? 0)
      }

      return [
        {
          id: 'total_devices',
          title: '总设备',
          value: String(record.total_devices ?? '0'),
        },
        {
          id: 'availability',
          title: '可用性',
          value: `${formatPercentageValue(record.availability).toFixed(1)}%`,
        },
        {
          id: 'active_alerts',
          title: '活跃告警',
          value: String(record.active_alerts ?? '0'),
        },
        {
          id: 'avg_cpu',
          title: '平均 CPU',
          value: `${formatPercentageValue(record.avg_cpu).toFixed(1)}%`,
        },
        {
          id: 'avg_memory',
          title: '平均内存',
          value: `${formatPercentageValue(record.avg_memory).toFixed(1)}%`,
        },
        {
          id: 'avg_network',
          title: '峰值流量',
          value: formatBandwidthValue(Number(record.avg_network ?? 0)),
        },
      ]
    }

    return []
  } catch (error) {
    console.error('[fetchStatsV2] API call failed:', error)
    throw error instanceof Error ? error : new Error('获取统计数据失败')
  }
}

/**
 * 获取实时告警列表
 * @param limit - 返回数量限制
 * @returns 告警数组
 */
export async function fetchRealtimeAlerts(limit: number = 10): Promise<Alert[]> {
  try {
    const response = await api.get<unknown>(`/alerts?page=1&page_size=${limit}&sort_by=created_at&sort_order=desc`)

    // 后端返回分页对象，优先使用 alerts 数组（response 为数组时属性访问得 undefined，行为不变）
    const record = (response ?? {}) as RawRecord
    const alertList: unknown[] = Array.isArray(record.alerts) ? record.alerts
      : Array.isArray(record.recent) ? record.recent
      : Array.isArray(response) ? response
      : []

    return alertList.slice(0, limit).map((alertRaw) => {
      const alert = alertRaw as RawRecord
      const rawTime = alert.time ?? alert.timestamp ?? alert.created_at ?? new Date().toISOString()
      const rawId = alert.id ?? alert.alert_id ?? alert.alertId ?? 0
      const parsedId = typeof rawId === 'number' ? rawId : Number(String(rawId))
      const id = Number.isFinite(parsedId) ? parsedId : 0
      return {
        id,
        deviceName: toStr(alert.device_name ?? alert.device ?? alert.deviceName ?? alert.source, '未知设备'),
        message: toStr(alert.message ?? alert.description ?? alert.title),
        severity: normalizeAlertSeverity(alert.severity ?? alert.level ?? alert.priority ?? 'info'),
        time: formatAlertTime(rawTime),
      }
    })
  } catch (error) {
    console.error('获取实时告警失败:', error)
    throw error instanceof Error ? error : new Error('获取实时告警失败')
  }
}

/**
 * 获取完整的监控数据 (一次性获取所有数据)
 * @param timeRange - 时间范围
 * @returns 监控数据
 */
export async function fetchMonitoringDataV2(
  timeRange: string = '24h'
): Promise<MonitoringDataEnvelope> {
  const MONITORING_SECTION_KEYS: MonitoringSectionKey[] = [
    'stats',
    'systemPerformance',
    'temperature',
    'deviceStatus',
    'availability',
    'networkTraffic',
    'realtimeAlerts',
  ]

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  const normalizeSectionStatus = (
    key: MonitoringSectionKey,
    raw: unknown
  ): MonitoringSectionStates[MonitoringSectionKey] => {
    const fallbackMessages: Record<MonitoringSectionKey, string> = {
      stats: '统计指标加载失败',
      systemPerformance: '系统性能数据加载失败',
      temperature: '温度数据加载失败',
      deviceStatus: '设备状态分布加载失败',
      availability: '可用性数据加载失败',
      networkTraffic: '网络流量数据加载失败',
      realtimeAlerts: '实时告警加载失败',
    }

    if (!isRecord(raw)) {
      return { ok: false, message: `后端响应缺少 ${key} 分区状态` }
    }

    const ok = raw.ok === true ? true : raw.ok === false ? false : false
    const message =
      typeof raw.message === 'string' && raw.message.trim() !== ''
        ? raw.message.trim()
        : ok
          ? undefined
          : fallbackMessages[key]

    const limitedByPermission = raw.limitedByPermission === true
    const requiredPermission =
      typeof raw.requiredPermission === 'string' ? raw.requiredPermission.trim() : ''

    return {
      ok: limitedByPermission ? true : ok,
      message,
      limitedByPermission: limitedByPermission ? true : undefined,
      requiredPermission: requiredPermission !== '' ? requiredPermission : undefined,
    }
  }

  const normalizeMonitoringData = (raw: unknown): MonitoringDataV2 => {
    const nowIso = new Date().toISOString()

    const toNumber = (value: unknown, fallback: number): number => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed === '') return fallback
        const parsed = Number(trimmed)
        return Number.isFinite(parsed) ? parsed : fallback
      }
      return fallback
    }

    const toNonEmptyString = (value: unknown): string => {
      if (typeof value === 'string') return value.trim()
      if (value === null || value === undefined) return ''
      return String(value).trim()
    }

    const normalizeTimestamp = (value: unknown): string => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString()
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value)
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString()
        }
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed !== '') {
          const date = new Date(trimmed)
          if (!Number.isNaN(date.getTime())) {
            return trimmed
          }
        }
      }
      return nowIso
    }

    if (!isRecord(raw)) {
      return {
        systemPerformance: [],
        temperatureHistory: [],
        deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
        availability: { current: 0, target: 99.9, trend: 'stable' },
        networkTrafficHistory: [],
        statsV2: [],
        realtimeAlerts: [],
        lastUpdate: nowIso,
      }
    }

    const normalizeTrend = (value: unknown): AvailabilityData['trend'] => {
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
      if (normalized === 'up' || normalized === 'down' || normalized === 'stable') {
        return normalized
      }
      return 'stable'
    }

    const availabilityRaw = raw.availability
    const availability = isRecord(availabilityRaw)
      ? {
          current: toNumber(availabilityRaw.current, 0),
          target: toNumber(availabilityRaw.target, 99.9),
          trend: normalizeTrend(availabilityRaw.trend),
          lastUpdate: isRecord(availabilityRaw) ? normalizeTimestamp(availabilityRaw.lastUpdate) : undefined,
        }
      : { current: 0, target: 99.9, trend: 'stable' as const }

    const distRaw = raw.deviceStatusDistribution
    const deviceStatusDistribution = isRecord(distRaw)
      ? {
          healthy: toNumber(distRaw.healthy, 0),
          warning: toNumber(distRaw.warning, 0),
          critical: toNumber(distRaw.critical, 0),
          offline: toNumber(distRaw.offline, 0),
        }
      : { healthy: 0, warning: 0, critical: 0, offline: 0 }

    const normalizeSystemPerformance = (value: unknown): SystemPerformanceDataPoint[] => {
      if (!Array.isArray(value)) return []

      const out: SystemPerformanceDataPoint[] = []
      for (const item of value) {
        if (!isRecord(item)) continue
        out.push({
          timestamp: normalizeTimestamp(item.timestamp ?? item.time),
          cpu: toNumber(item.cpu ?? item.cpu_usage, 0),
          memory: toNumber(item.memory ?? item.memory_usage, 0),
          network: toNumber(item.network ?? item.network_traffic, 0),
        })
      }

      return out
    }

    const normalizeTemperatureHistory = (value: unknown): TemperatureDataPoint[] => {
      if (!Array.isArray(value)) return []

      const out: TemperatureDataPoint[] = []
      for (const item of value) {
        if (!isRecord(item)) continue

        const devicesRaw = item.devices ?? item.temperatures
        const devices: Record<string, number> = {}
        if (isRecord(devicesRaw)) {
          for (const [key, rawValue] of Object.entries(devicesRaw)) {
            const name = String(key).trim()
            if (name === '') continue
            const temp = toNumber(rawValue, NaN)
            if (!Number.isFinite(temp)) continue
            devices[name] = temp
          }
        }

        out.push({
          timestamp: normalizeTimestamp(item.timestamp ?? item.time),
          devices,
        })
      }

      return out
    }

    const normalizeNetworkTrafficHistory = (value: unknown): NetworkTrafficDataPoint[] => {
      if (!Array.isArray(value)) return []

      const out: NetworkTrafficDataPoint[] = []
      for (const item of value) {
        if (!isRecord(item)) continue
        out.push({
          timestamp: normalizeTimestamp(item.timestamp ?? item.time),
          inbound: toNumber(item.inbound ?? item.in ?? item.rx, 0),
          outbound: toNumber(item.outbound ?? item.out ?? item.tx, 0),
        })
      }

      return out
    }

    const normalizeStatsV2 = (value: unknown): StatCardData[] => {
      if (!Array.isArray(value)) return []

      const out: StatCardData[] = []
      value.forEach((item, index) => {
        if (!isRecord(item)) return

        const id = toNonEmptyString(item.id) || `stat_${index}`
        const title = toNonEmptyString(item.title ?? item.name) || ''

        const rawValue = (item as Record<string, unknown>).value
        const normalizedValue =
          typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : toNonEmptyString(rawValue)

        const change = toNonEmptyString(item.change)
        const trendRaw = toNonEmptyString(item.trend).toLowerCase()
        const trend = trendRaw === 'up' || trendRaw === 'down' || trendRaw === 'stable' ? (trendRaw as StatCardData['trend']) : undefined

        out.push({
          id,
          title,
          value: normalizedValue,
          change: change !== '' ? change : undefined,
          trend,
        })
      })

      return out
    }

    const normalizeRealtimeAlerts = (value: unknown): Alert[] => {
      if (!Array.isArray(value)) return []

      const out: Alert[] = []
      for (const item of value) {
        if (!isRecord(item)) continue

        const rawTime = item.time ?? item.timestamp ?? item.created_at
        const rawId = item.id ?? item.alert_id ?? item.alertId ?? 0
        const parsedId = typeof rawId === 'number' ? rawId : Number(String(rawId))
        const id = Number.isFinite(parsedId) ? parsedId : undefined

        out.push({
          id,
          deviceName: toNonEmptyString(item.deviceName ?? item.device_name ?? item.device ?? item.source) || '未知设备',
          message: toNonEmptyString(item.message ?? item.description ?? item.title),
          severity: normalizeAlertSeverity(item.severity ?? item.level ?? item.priority ?? 'info'),
          time: formatAlertTime(rawTime),
        })
      }

      return out
    }

    return {
      systemPerformance: normalizeSystemPerformance(raw.systemPerformance),
      temperatureHistory: normalizeTemperatureHistory(raw.temperatureHistory),
      deviceStatusDistribution,
      availability,
      networkTrafficHistory: normalizeNetworkTrafficHistory(raw.networkTrafficHistory),
      statsV2: normalizeStatsV2(raw.statsV2),
      realtimeAlerts: normalizeRealtimeAlerts(raw.realtimeAlerts),
      lastUpdate: toNonEmptyString(raw.lastUpdate) || nowIso,
    }
  }

  const normalizeEnvelope = (raw: unknown): MonitoringDataEnvelope => {
    if (!isRecord(raw)) {
      throw new Error('监控数据加载失败')
    }

    const sectionsRaw = raw.sections
    const normalizedSections = MONITORING_SECTION_KEYS.reduce((acc, key) => {
      const value = isRecord(sectionsRaw) ? sectionsRaw[key] : undefined
      acc[key] = normalizeSectionStatus(key, value)
      return acc
    }, {} as MonitoringSectionStates)

    const failedRaw = raw.failedSections
    const failed = Array.isArray(failedRaw)
      ? failedRaw.map((item) => String(item)).filter((key): key is MonitoringSectionKey => (MONITORING_SECTION_KEYS as string[]).includes(key))
      : []

    const computedFailed = MONITORING_SECTION_KEYS.filter((key) => {
      const status = normalizedSections[key]
      if (status.limitedByPermission) return false
      return status.ok === false
    })

    const failedSections = failed.length > 0 ? failed : computedFailed
    const hasPartialFailure = raw.hasPartialFailure === true || failedSections.length > 0
    const lastUpdate =
      typeof raw.lastUpdate === 'string' && raw.lastUpdate.trim() !== ''
        ? raw.lastUpdate
        : new Date().toISOString()
    const generatedAt =
      typeof raw.generatedAt === 'string' && raw.generatedAt.trim() !== ''
        ? raw.generatedAt
        : new Date().toISOString()

    return {
      data: normalizeMonitoringData(raw.data),
      sections: normalizedSections,
      hasPartialFailure,
      failedSections,
      lastUpdate,
      generatedAt,
    }
  }

  // 优先使用后端聚合接口（减少扇出请求）；当后端尚未升级时自动回退到旧逻辑。
  try {
    const raw = await api.post<unknown>('/monitoring/dashboard/v2', {
      time_range: timeRange,
      alerts_limit: 10,
    })
    return normalizeEnvelope(raw)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return await fetchMonitoringDataV2Legacy(timeRange)
    }

    console.error('获取监控数据失败:', error)
    // 保留后端错误状态码/类型，供页面做分级提示（401/403/5xx/超时等）。
    if (error instanceof ApiClientError) {
      throw error
    }
    // 保留浏览器网络错误（例如 Failed to fetch），供页面提示“后端未启动/网络异常”。
    if (error instanceof Error) {
      throw error
    }
    throw new Error('监控数据加载失败')
  }
}

async function fetchMonitoringDataV2Legacy(timeRange: string): Promise<MonitoringDataEnvelope> {
  const toErrorMessage = (reason: unknown, fallback: string) => {
    if (reason instanceof Error && reason.message.trim() !== '') {
      return reason.message
    }
    return fallback
  }

  try {
    const [
      systemPerformance,
      temperatureHistory,
      deviceStatusDistribution,
      availability,
      networkTrafficHistory,
      statsV2,
      realtimeAlerts,
    ] = await Promise.allSettled([
      fetchSystemPerformanceHistory(timeRange),
      fetchTemperatureHistory(timeRange),
      fetchDeviceStatusDistribution(),
      fetchAvailabilityData(),
      fetchNetworkTrafficHistory(timeRange),
      fetchStatsV2(),
      fetchRealtimeAlerts(10),
    ])

    const lastUpdate = new Date().toISOString()

    const sections: MonitoringSectionStates = {
      stats: {
        ok: statsV2.status === 'fulfilled',
        message: statsV2.status === 'rejected' ? toErrorMessage(statsV2.reason, '统计指标加载失败') : undefined,
      },
      systemPerformance: {
        ok: systemPerformance.status === 'fulfilled',
        message: systemPerformance.status === 'rejected' ? toErrorMessage(systemPerformance.reason, '系统性能数据加载失败') : undefined,
      },
      temperature: {
        ok: temperatureHistory.status === 'fulfilled',
        message: temperatureHistory.status === 'rejected' ? toErrorMessage(temperatureHistory.reason, '温度数据加载失败') : undefined,
      },
      deviceStatus: {
        ok: deviceStatusDistribution.status === 'fulfilled',
        message: deviceStatusDistribution.status === 'rejected' ? toErrorMessage(deviceStatusDistribution.reason, '设备状态分布加载失败') : undefined,
      },
      availability: {
        ok: availability.status === 'fulfilled',
        message: availability.status === 'rejected' ? toErrorMessage(availability.reason, '可用性数据加载失败') : undefined,
      },
      networkTraffic: {
        ok: networkTrafficHistory.status === 'fulfilled',
        message: networkTrafficHistory.status === 'rejected' ? toErrorMessage(networkTrafficHistory.reason, '网络流量数据加载失败') : undefined,
      },
      realtimeAlerts: {
        ok: realtimeAlerts.status === 'fulfilled',
        message: realtimeAlerts.status === 'rejected' ? toErrorMessage(realtimeAlerts.reason, '实时告警加载失败') : undefined,
      },
    }

    const failedSections = (Object.keys(sections) as MonitoringSectionKey[]).filter((key) => !sections[key].ok)
    if (failedSections.length === (Object.keys(sections) as MonitoringSectionKey[]).length) {
      throw new Error('监控数据加载失败')
    }

    const data: MonitoringDataV2 = {
      systemPerformance: systemPerformance.status === 'fulfilled' ? systemPerformance.value : [],
      temperatureHistory: temperatureHistory.status === 'fulfilled' ? temperatureHistory.value : [],
      deviceStatusDistribution:
        deviceStatusDistribution.status === 'fulfilled'
          ? deviceStatusDistribution.value
          : { healthy: 0, warning: 0, critical: 0, offline: 0 },
      availability:
        availability.status === 'fulfilled'
          ? availability.value
          : { current: 0, target: 99.9, trend: 'stable' },
      networkTrafficHistory:
        networkTrafficHistory.status === 'fulfilled' ? networkTrafficHistory.value : [],
      statsV2: statsV2.status === 'fulfilled' ? statsV2.value : [],
      realtimeAlerts: realtimeAlerts.status === 'fulfilled' ? realtimeAlerts.value : [],
      lastUpdate,
    }

    return {
      data,
      sections,
      hasPartialFailure: failedSections.length > 0,
      failedSections,
      lastUpdate,
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('获取监控数据失败:', error)
    if (error instanceof Error && error.message.includes('监控数据加载失败')) {
      throw error
    }
    throw new Error('监控数据加载失败')
  }
}
