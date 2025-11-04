import { api } from '@/lib/api-client'
import { NetworkStat, DeviceMonitoringStatus, NetworkTraffic, AlertSummary, MonitoringData } from '../types'

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
export async function fetchMonitoringOverview(): Promise<MonitoringData> {
  try {
    const [overview, networkStatsRaw, deviceStatusRaw, networkTrafficRaw, alertSummaryRaw] = await Promise.all([
      api.get<MonitoringOverviewApi>('/monitoring/overview'),
      api.get<NetworkStatApi[]>('/monitoring/network-stats'),
      api.get<DeviceStatusApi[]>('/monitoring/devices'),
      api.get<NetworkTrafficApi>('/monitoring/traffic?time_range=24h'),
      api.get<AlertSummaryApi>('/monitoring/alerts/summary'),
    ])

    const networkStats = transformNetworkStatsData(networkStatsRaw)
    const deviceStatus = transformDeviceStatusData(deviceStatusRaw)
    const networkTraffic = transformTrafficData(networkTrafficRaw)
    const alertSummary = transformAlertSummaryData(alertSummaryRaw)

    return {
      networkStats,
      deviceStatus,
      networkTraffic,
      alertSummary,
      lastUpdate: overview?.last_updated ?? new Date().toISOString(),
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
export async function fetchNetworkStats(): Promise<NetworkStat[]> {
  try {
    const response = await api.get<NetworkStatApi[]>('/monitoring/network-stats')
    return transformNetworkStatsData(response)
  } catch (error) {
    console.error('获取网络统计失败:', error)
    throw error instanceof Error ? error : new Error('获取网络统计失败')
  }
}

// 获取设备监控状态
export async function fetchDeviceMonitoringStatus(): Promise<DeviceMonitoringStatus[]> {
  try {
    const response = await api.get<DeviceStatusApi[]>('/monitoring/devices')
    return transformDeviceStatusData(response)
  } catch (error) {
    console.error('获取设备监控状态失败:', error)
    throw error instanceof Error ? error : new Error('获取设备监控状态失败')
  }
}

// 获取网络流量数据
export async function fetchNetworkTraffic(timeRange: string = '24h'): Promise<NetworkTraffic> {
  try {
    const response = await api.get<NetworkTrafficApi>(`/monitoring/traffic?time_range=${timeRange}`)
    return transformTrafficData(response)
  } catch (error) {
    console.error('获取网络流量失败:', error)
    throw error instanceof Error ? error : new Error('获取网络流量失败')
  }
}

// 获取告警汇总
export async function fetchAlertSummary(): Promise<AlertSummary> {
  try {
    const response = await api.get<AlertSummaryApi>('/monitoring/alerts/summary')
    return transformAlertSummaryData(response)
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
export const exportMonitoringReport = async (_params: unknown) => {
  void _params
  throw new Error('exportMonitoringReport API 暂未实现')
}
