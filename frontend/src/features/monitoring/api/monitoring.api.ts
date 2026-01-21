import { api } from '@/lib/api-client'
import {
  NetworkStat,
  DeviceMonitoringStatus,
  NetworkTraffic,
  AlertSummary,
  MonitoringData,
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
  DeviceStatusDistribution,
  AvailabilityData,
  NetworkTrafficDataPoint,
  StatCardData,
  Alert,
  MonitoringDataV2,
} from '../types'

/**
 * 监控模块 API 接口
 * 已连接真实后端API - 支持实时数据更新
 */


interface NetworkStatApi {
  title?: string
  name?: string
  value: string
  change?: string
  trend?: 'up' | 'down' | string
  icon?: string
  color?: string
  data?: number[]
}

interface DeviceStatusApi {
  name: string
  status?: string
  cpu?: number
  cpu_usage?: number
  memory?: number
  memory_usage?: number
  uptime?: string
  last_seen?: string
  alerts?: number
  alert_count?: number
}

interface NetworkTrafficMetricApi {
  value?: string
  percentage?: number
  current?: number
  peak?: number
  data?: number[]
}

interface NetworkTrafficApi {
  inbound?: NetworkTrafficMetricApi
  outbound?: NetworkTrafficMetricApi
  packetLoss?: { value?: string; percentage?: number }
  peakTime?: string
}

interface AlertSummaryApi {
  critical?: number
  warning?: number
  info?: number
  recent?: Array<{ id: number; message: string; severity: string; time: string }>
  trends?: { up: number; down: number; stable: number }
}

interface MonitoringOverviewApi {
  last_updated?: string
  total_alerts?: number
}
// 获取监控概览数据
// 注意: 后端路由已更新，使用实际存在的端点
export async function fetchMonitoringOverview(): Promise<MonitoringData> {
  try {
    const [statsRaw, deviceStatusRaw, trafficSummaryRaw, alertStatsRaw] = await Promise.all([
      api.get<MonitoringOverviewApi>('/monitoring/stats'),           // 后端实际路由
      api.get<DeviceStatusApi[]>('/monitoring/devices/status'),      // 后端实际路由
      api.get<NetworkTrafficApi>('/traffic/summary'),                // 后端实际路由
      api.get<AlertSummaryApi>('/alerts/statistics'),                // 后端实际路由
    ])

    // 从 stats 响应构建网络统计数据
    const networkStats = statsRaw ? transformStatsToNetworkStats(statsRaw) : []
    const deviceStatus = transformDeviceStatusData(deviceStatusRaw)
    const networkTraffic = transformTrafficData(trafficSummaryRaw)
    const alertSummary = transformAlertStatsData(alertStatsRaw)

    return {
      networkStats,
      deviceStatus,
      networkTraffic,
      alertSummary,
      lastUpdate: statsRaw?.last_updated ?? new Date().toISOString(),
      totalAlerts:
        (alertSummary?.critical ?? 0) +
        (alertSummary?.warning ?? 0) +
        (alertSummary?.info ?? 0),
    }
  } catch (error) {
    console.error('获取监控概览失败:', error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error('获取监控概览失败')
  }
}

// 获取网络统计数据
// 注意: 后端没有专门的 network-stats 端点，从 /monitoring/stats 获取
export async function fetchNetworkStats(): Promise<NetworkStat[]> {
  try {
    const response = await api.get<MonitoringOverviewApi>('/monitoring/stats')
    return transformStatsToNetworkStats(response)
  } catch (error) {
    console.error('获取网络统计失败:', error)
    throw error instanceof Error ? error : new Error('获取网络统计失败')
  }
}

// 将 /monitoring/stats 响应转换为网络统计数据
function transformStatsToNetworkStats(stats: MonitoringOverviewApi | null): NetworkStat[] {
  if (!stats) return []
  
  // 从 stats 响应构建网络统计卡片数据
  const statsData = stats as Record<string, unknown>
  return [
    {
      title: '设备总数',
      value: String(statsData.total_devices ?? statsData.device_count ?? 0),
      change: '+0%',
      trend: 'up' as const,
      icon: 'server',
      color: 'blue',
      data: [],
    },
    {
      title: '在线设备',
      value: String(statsData.online_devices ?? statsData.active_devices ?? 0),
      change: '+0%',
      trend: 'up' as const,
      icon: 'check-circle',
      color: 'green',
      data: [],
    },
    {
      title: '告警数量',
      value: String(statsData.total_alerts ?? statsData.alert_count ?? 0),
      change: '+0%',
      trend: 'up' as const,
      icon: 'alert-triangle',
      color: 'yellow',
      data: [],
    },
    {
      title: '平均响应时间',
      value: `${statsData.avg_response_time ?? 0}ms`,
      change: '+0%',
      trend: 'up' as const,
      icon: 'clock',
      color: 'purple',
      data: [],
    },
  ]
}

// 将 /alerts/statistics 响应转换为告警摘要
function transformAlertStatsData(apiData: AlertSummaryApi | null): AlertSummary {
  if (!apiData) {
    return { critical: 0, warning: 0, info: 0, recent: [], trends: { up: 0, down: 0, stable: 0 } }
  }
  
  const statsData = apiData as Record<string, unknown>
  return {
    critical: (statsData.critical as number) ?? (statsData.critical_count as number) ?? 0,
    warning: (statsData.warning as number) ?? (statsData.warning_count as number) ?? 0,
    info: (statsData.info as number) ?? (statsData.info_count as number) ?? 0,
    recent: (statsData.recent as AlertSummary['recent']) ?? [],
    trends: (statsData.trends as AlertSummary['trends']) ?? { up: 0, down: 0, stable: 0 },
  }
}

// 获取设备监控状态
// 注意: 后端实际路由是 /monitoring/devices/status
export async function fetchDeviceMonitoringStatus(): Promise<DeviceMonitoringStatus[]> {
  try {
    const response = await api.get<DeviceStatusApi[]>('/monitoring/devices/status')
    return transformDeviceStatusData(response)
  } catch (error) {
    console.error('获取设备监控状态失败:', error)
    throw error instanceof Error ? error : new Error('获取设备监控状态失败')
  }
}

// 获取网络流量数据
// 注意: 后端实际路由是 /traffic/summary
export async function fetchNetworkTraffic(timeRange: string = '24h'): Promise<NetworkTraffic> {
  try {
    const response = await api.get<NetworkTrafficApi>(`/traffic/summary?time_range=${timeRange}`)
    return transformTrafficData(response)
  } catch (error) {
    console.error('获取网络流量失败:', error)
    throw error instanceof Error ? error : new Error('获取网络流量失败')
  }
}

// 获取告警汇总
// 注意: 后端实际路由是 /alerts/statistics
export async function fetchAlertSummary(): Promise<AlertSummary> {
  try {
    const response = await api.get<AlertSummaryApi>('/alerts/statistics')
    return transformAlertStatsData(response)
  } catch (error) {
    console.error('获取告警汇总失败:', error)
    throw error instanceof Error ? error : new Error('获取告警汇总失败')
  }
}

// 获取设备历史指标
export async function fetchDeviceMetrics(deviceId: number, timeRange: string = '24h'): Promise<unknown> {
  try {
    if (timeRange === 'current') {
      return await api.get(`/monitoring/devices/${deviceId}/current`)
    }

    const { start, end } = resolveTimeRange(timeRange)

    const payload = {
      device_ids: [deviceId],
      start_time: start,
      end_time: end,
      metrics: ['cpu_usage', 'memory_usage', 'bandwidth_utilization'],
    }

    return await api.post('/monitoring/devices/historical', payload, {
      timeout: 15000,
    })
  } catch (error) {
    console.error('获取设备指标失败:', error)
    throw error instanceof Error ? error : new Error('获取设备指标失败')
  }
}

// 获取系统性能概况
export async function fetchSystemPerformance(): Promise<unknown> {
  try {
    return await api.get('/monitoring/status')
  } catch (error) {
    console.error('获取系统性能失败:', error)
    throw error instanceof Error ? error : new Error('获取系统性能失败')
  }
}

// 获取历史监控数据
export async function fetchHistoricalData(params: {
  startTime: string
  endTime: string
  deviceIds?: number[]
  metrics?: string[]
}): Promise<unknown> {
  try {
    const payload = {
      device_ids: params.deviceIds ?? [],
      start_time: params.startTime,
      end_time: params.endTime,
      metrics: params.metrics ?? ['cpu_usage', 'memory_usage', 'bandwidth_utilization'],
    }

    return await api.post('/monitoring/devices/historical', payload, {
      timeout: 15000,
    })
  } catch (error) {
    console.error('获取历史数据失败:', error)
    throw error instanceof Error ? error : new Error('获取历史数据失败')
  }
}

// 启动实时监控
export async function startRealTimeMonitoring(deviceIds?: number[]): Promise<boolean> {
  try {
    if (!deviceIds || deviceIds.length === 0) {
      return true
    }

    await Promise.all(
      deviceIds.map(deviceId =>
        api.post(`/monitoring/devices/${deviceId}/start`, {
          device_id: deviceId,
          interval: 60,
          enabled: true,
        })
      )
    )

    return true
  } catch (error) {
    console.error('启动实时监控失败:', error)
    return false
  }
}

// 停止实时监控
export async function stopRealTimeMonitoring(deviceIds?: number[]): Promise<boolean> {
  try {
    if (!deviceIds || deviceIds.length === 0) {
      return true
    }

    await Promise.all(
      deviceIds.map(deviceId =>
        api.post(`/monitoring/devices/${deviceId}/stop`, {
          device_id: deviceId,
          interval: 60,
          enabled: false,
        })
      )
    )

    return true
  } catch (error) {
    console.error('停止实时监控失败:', error)
    return false
  }
}

// 数据转换函数
function transformNetworkStatsData(apiData: NetworkStatApi[]): NetworkStat[] {
  if (!Array.isArray(apiData)) return []

  return apiData.map((stat, index) => {
    const title = resolveStatTitle(stat, index)
    const trend = resolveTrend(stat)
    const change = stat.change ?? (trend === 'up' ? '+0%' : '-0%')

    return {
      title,
      value: stat.value ?? '0',
      change,
      trend,
      icon: stat.icon ?? getIconForMetric(title),
      color: stat.color ?? getColorForMetric(title),
      data: stat.data ?? [],
    }
  })
}

function transformDeviceStatusData(apiData: DeviceStatusApi[]): DeviceMonitoringStatus[] {
  if (!Array.isArray(apiData)) return []

  return apiData.map((device) => ({
    name: device.name,
    status: normalizeDeviceStatus(device.status),
    cpu: device.cpu ?? device.cpu_usage ?? 0,
    memory: device.memory ?? device.memory_usage ?? 0,
    uptime: device.uptime ?? '0',
    lastSeen: device.last_seen,
    alerts: device.alert_count ?? device.alerts ?? 0,
  }))
}

function transformTrafficData(apiData: NetworkTrafficApi): NetworkTraffic {
  return {
    inbound: normalizeTrafficMetric(apiData?.inbound),
    outbound: normalizeTrafficMetric(apiData?.outbound),
    packetLoss: {
      value: apiData?.packetLoss?.value ?? '0%',
      percentage: apiData?.packetLoss?.percentage ?? 0,
    },
    peakTime: apiData?.peakTime,
  }
}

function transformAlertSummaryData(apiData: AlertSummaryApi): AlertSummary {
  return {
    critical: apiData?.critical || 0,
    warning: apiData?.warning || 0,
    info: apiData?.info || 0,
    recent: apiData?.recent || [],
    trends: apiData?.trends || { up: 0, down: 0, stable: 0 },
  }
}

function resolveStatTitle(stat: NetworkStatApi, index: number): string {
  const rawTitle = stat.title ?? stat.name
  if (typeof rawTitle === 'string' && rawTitle.trim().length > 0) {
    return rawTitle
  }
  return `指标${index + 1}`
}

function resolveTrend(stat: NetworkStatApi): 'up' | 'down' {
  const normalized = (stat.trend ?? '').toLowerCase()
  if (normalized === 'up') return 'up'
  if (normalized === 'down') return 'down'
  const change = stat.change ?? ''
  return change.trim().startsWith('-') ? 'down' : 'up'
}

function normalizeDeviceStatus(status?: string): DeviceMonitoringStatus['status'] {
  const normalized = (status ?? '').toLowerCase()
  if (['healthy', 'normal', 'ok'].includes(normalized)) return 'healthy'
  if (['critical', 'error', 'down', 'failed'].includes(normalized)) return 'critical'
  return 'warning'
}

function normalizeTrafficMetric(metric?: NetworkTrafficMetricApi): NetworkTraffic['inbound'] {
  return {
    value: metric?.value ?? '0',
    percentage: metric?.percentage ?? 0,
    current: metric?.current ?? 0,
    peak: metric?.peak ?? 0,
    data: metric?.data ?? [],
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

// 工具函数
function getIconForMetric(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('cpu') || lowerName.includes('处理')) return 'cpu'
  if (lowerName.includes('memory') || lowerName.includes('内存')) return 'harddrive'
  if (lowerName.includes('network') || lowerName.includes('网络') || lowerName.includes('流量')) return 'network'
  if (lowerName.includes('response') || lowerName.includes('响应') || lowerName.includes('延迟')) return 'gauge'
  return 'activity'
}

function getColorForMetric(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('cpu') || lowerName.includes('处理')) return 'blue'
  if (lowerName.includes('memory') || lowerName.includes('内存')) return 'green'
  if (lowerName.includes('network') || lowerName.includes('网络') || lowerName.includes('流量')) return 'purple'
  if (lowerName.includes('response') || lowerName.includes('响应') || lowerName.includes('延迟')) return 'yellow'
  return 'blue'
}

// 导出别名函数以保持向后兼容
export const fetchMonitoringData = fetchMonitoringOverview
export const fetchDeviceStatus = fetchDeviceMonitoringStatus

/**
 * 导出监控报告参数
 */
export interface ExportMonitoringReportParams {
  /** 导出格式 */
  format: 'pdf' | 'excel' | 'csv'
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
  /** 状态 */
  status: string
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

/**
 * ════════════════════════════════════════════════��══════════
 * 监控中心 v1.1 API - 扩展接口
 * ═══════════════════════════════════════════════════════════
 */

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

    // 转换后端数据格式
    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: any) => ({
        timestamp: point.timestamp || point.time || new Date().toISOString(),
        cpu: point.cpu_usage ?? point.cpu ?? 0,
        memory: point.memory_usage ?? point.memory ?? 0,
        network: point.network_traffic ?? point.network ?? 0,
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

    // 转换后端数据格式
    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: any) => ({
        timestamp: point.timestamp || point.time || new Date().toISOString(),
        devices: point.devices || point.temperatures || {},
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
    const response = await api.get<any>('/monitoring/devices/distribution')

    return {
      healthy: response?.healthy ?? response?.normal ?? 0,
      warning: response?.warning ?? response?.degraded ?? 0,
      critical: response?.critical ?? response?.error ?? response?.down ?? 0,
      offline: response?.offline ?? response?.inactive ?? 0,
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
    const response = await api.get<any>('/monitoring/availability')

    return {
      current: response?.current ?? response?.availability ?? 0,
      target: response?.target ?? response?.sla ?? 99.9,
      trend: response?.trend ?? 'stable',
      lastUpdate: response?.last_update ?? response?.lastUpdate ?? new Date().toISOString(),
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

    // 转换后端数据格式
    if (Array.isArray(response) && response.length > 0) {
      return response.map((point: any) => ({
        timestamp: point.timestamp || point.time || new Date().toISOString(),
        inbound: point.inbound ?? point.in ?? point.rx ?? 0,
        outbound: point.outbound ?? point.out ?? point.tx ?? 0,
      }))
    }

    return []
  } catch (error) {
    console.error('获取网络流量历史失败:', error)
    throw error instanceof Error ? error : new Error('获取网络流量历史失败')
  }
}

/**
 * 获取统计卡片数据 (v1.1 的 6 个关键指标)
 * @returns 统计卡片数据数组
 */
export async function fetchStatsV2(): Promise<StatCardData[]> {
  try {
    // 注意: 后端实际路由是 /monitoring/stats 而不是 /monitoring/stats/summary
    console.log('[fetchStatsV2] Calling /monitoring/stats')
    const response = await api.get<any>('/monitoring/stats')
    console.log('[fetchStatsV2] Response received:', response)

    // 如果后端返回数组，直接使用
    if (Array.isArray(response)) {
      return response.map((stat: any, index: number) => ({
        id: stat.id || `stat_${index}`,
        title: stat.title || stat.name || '',
        value: String(stat.value ?? '0'),
        change: stat.change,
        trend: stat.trend as 'up' | 'down' | 'stable' | undefined,
        icon: stat.icon,
        color: stat.color as any,
      }))
    }

    // 如果后端返回对象，转换为数组
    if (response && typeof response === 'object') {
      // 辅助函数：将小数格式（0-1）转换为百分比格式（0-100）
      const formatPercentageValue = (value: any): number => {
        const num = Number(value ?? 0)
        // 如果值在 0-1 之间（小数格式），乘以 100 转换为百分比
        if (num >= 0 && num < 1) {
          return num * 100
        }
        // 否则直接使用（已经是百分比格式）
        return num
      }

      return [
        // 1. 总设备
        {
          id: 'total_devices',
          title: '总设备',
          value: String(response.total_devices ?? '0'),
          change: undefined, // 后端暂未提供趋势数据
          trend: undefined,
        },
        // 2. 可用性
        {
          id: 'availability',
          title: '可用性',
          value: `${formatPercentageValue(response.availability).toFixed(1)}%`,
          change: undefined,
          trend: undefined,
        },
        // 3. 活跃告警
        {
          id: 'active_alerts',
          title: '活跃告警',
          value: String(response.active_alerts ?? '0'),
          change: undefined,
          trend: undefined,
        },
        // 4. 平均 CPU
        {
          id: 'avg_cpu',
          title: '平均 CPU',
          value: `${formatPercentageValue(response.avg_cpu).toFixed(1)}%`,
          change: undefined,
          trend: undefined,
        },
        // 5. 平均内存
        {
          id: 'avg_memory',
          title: '平均内存',
          value: `${formatPercentageValue(response.avg_memory).toFixed(1)}%`,
          change: undefined,
          trend: undefined,
        },
        // 6. 网络流量峰值
        {
          id: 'avg_network',
          title: '网络流量',
          value: `${Number(response.avg_network ?? 0).toFixed(1)} Mbps`,
          change: undefined,
          trend: undefined,
        },
      ]
    }

    return []
  } catch (error) {
    console.error('[fetchStatsV2] API call failed:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      url: '/monitoring/stats'
    })
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
    // 注意: 后端没有 /monitoring/alerts/recent，使用 /alerts/ 并限制数量
    const response = await api.get<any>(`/alerts/?limit=${limit}&sort_by=created_at&sort_order=desc`)

    if (Array.isArray(response)) {
      return response.map((alert: any) => ({
        id: alert.id ?? alert.alert_id ?? 0,
        deviceName: alert.device_name ?? alert.deviceName ?? alert.source ?? '未知设备',
        message: alert.message ?? alert.description ?? '',
        severity: (alert.severity ?? alert.level ?? 'info') as 'critical' | 'warning' | 'info',
        time: alert.time ?? alert.timestamp ?? alert.created_at ?? new Date().toISOString(),
      }))
    }

    // 兼容旧格式 (recent 数组)
    if (response?.recent && Array.isArray(response.recent)) {
      return response.recent.map((alert: any) => ({
        id: alert.id ?? 0,
        deviceName: alert.device_name ?? '未知设备',
        message: alert.message ?? '',
        severity: alert.severity as any,
        time: alert.time ?? new Date().toISOString(),
      }))
    }

    return []
  } catch (error) {
    console.error('获取实时告警失败:', error)
    throw error instanceof Error ? error : new Error('获取实时告警失败')
  }
}

/**
 * 获取完整的监控数据 v2 (一次性获取所有数据)
 * @param timeRange - 时间范围
 * @returns 监控数据 v2
 */
export async function fetchMonitoringDataV2(
  timeRange: string = '24h'
): Promise<Partial<MonitoringDataV2>> {
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

    return {
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
      statsV2: (() => {
        if (statsV2.status === 'fulfilled') {
          return statsV2.value
        } else {
          console.error('[fetchMonitoringDataV2] statsV2 request failed:', statsV2.reason)
          return []
        }
      })(),
      realtimeAlerts: realtimeAlerts.status === 'fulfilled' ? realtimeAlerts.value : [],
      lastUpdate: new Date().toISOString(),
    }
  } catch (error) {
    console.error('获取监控数据 v2 失败:', error)
    throw error instanceof Error ? error : new Error('获取监控数据 v2 失败')
  }
}

