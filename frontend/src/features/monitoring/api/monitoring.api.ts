import { api } from '@/lib/api-client'
import {
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
  if (bps === 0) return '0 bps'
  if (bps < 0) return '0 bps'

  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  const k = 1000 // 网络带宽使用1000进制

  const i = Math.floor(Math.log(bps) / Math.log(k))
  const unitIndex = Math.min(i, units.length - 1)

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
 * 获取统计卡片数据 (6 个关键指标)
 * @returns 统计卡片数据数组
 */
export async function fetchStatsV2(): Promise<StatCardData[]> {
  try {
    const response = await api.get<any>('/monitoring/stats')

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
      const formatPercentageValue = (value: any): number => {
        return Number(value ?? 0)
      }

      return [
        {
          id: 'total_devices',
          title: '总设备',
          value: String(response.total_devices ?? '0'),
        },
        {
          id: 'availability',
          title: '可用性',
          value: `${formatPercentageValue(response.availability).toFixed(1)}%`,
        },
        {
          id: 'active_alerts',
          title: '活跃告警',
          value: String(response.active_alerts ?? '0'),
        },
        {
          id: 'avg_cpu',
          title: '平均 CPU',
          value: `${formatPercentageValue(response.avg_cpu).toFixed(1)}%`,
        },
        {
          id: 'avg_memory',
          title: '平均内存',
          value: `${formatPercentageValue(response.avg_memory).toFixed(1)}%`,
        },
        {
          id: 'avg_network',
          title: '峰值流量',
          value: formatBandwidthValue(Number(response.avg_network ?? 0)),
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
    const response = await api.get<any>(`/alerts/?page=1&page_size=${limit}&sort_by=created_at&sort_order=desc`)

    // 后端返回分页对象，优先使用 alerts 数组
    const alertList = Array.isArray(response?.alerts) ? response.alerts
      : Array.isArray(response?.recent) ? response.recent
      : Array.isArray(response) ? response
      : []

    return alertList.slice(0, limit).map((alert: any) => ({
      id: alert.id ?? alert.alert_id ?? 0,
      deviceName: alert.device_name ?? alert.device ?? alert.deviceName ?? alert.source ?? '未知设备',
      message: alert.message ?? alert.description ?? alert.title ?? '',
      severity: (alert.severity ?? alert.level ?? 'info') as 'critical' | 'warning' | 'info',
      time: alert.time ?? alert.timestamp ?? alert.created_at ?? new Date().toISOString(),
    }))
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
      statsV2: statsV2.status === 'fulfilled' ? statsV2.value : [],
      realtimeAlerts: realtimeAlerts.status === 'fulfilled' ? realtimeAlerts.value : [],
      lastUpdate: new Date().toISOString(),
    }
  } catch (error) {
    console.error('获取监控数据失败:', error)
    throw error instanceof Error ? error : new Error('获取监控数据失败')
  }
}
