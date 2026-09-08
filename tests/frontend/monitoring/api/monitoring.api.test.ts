jest.mock('@/lib/api-client', () => {
  class ApiClientError extends Error {
    status: number

    constructor(status: number, message: string = 'ApiClientError') {
      super(message)
      this.name = 'ApiClientError'
      this.status = status
    }
  }

  return {
    ApiClientError,
    api: {
      get: jest.fn(),
      post: jest.fn(),
    },
  }
})

import { api } from '@/lib/api-client'
import { fetchMonitoringDataV2, fetchRealtimeAlerts, fetchStatsV2 } from '@/features/monitoring/api/monitoring.api'

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock }

describe('monitoring.api', () => {
  it('fetchStatsV2: 六卡结构且支持 0<bps<1 的带宽格式化', async () => {
    mockedApi.get.mockResolvedValue({
      total_devices: 1,
      active_alerts: 2,
      avg_cpu: 1,
      avg_memory: 1,
      peak_outbound: 0.5,
      peak_inbound: 12266,
    })

    const stats = await fetchStatsV2()
    expect(stats.map((item) => item.id)).toEqual([
      'total_devices',
      'active_alerts',
      'avg_cpu',
      'avg_memory',
      'peak_outbound',
      'peak_inbound',
    ])
    expect(stats.find((item) => item.id === 'peak_outbound')?.value).toBe('0.50 bps')
    expect(stats.find((item) => item.id === 'peak_inbound')?.value).toBe('12.3 Kbps')
  })

  it('fetchRealtimeAlerts: 使用无尾斜杠的 /alerts 查询', async () => {
    mockedApi.get.mockResolvedValue({ alerts: [] })

    await fetchRealtimeAlerts(10)
    expect(mockedApi.get).toHaveBeenCalledWith(
      '/alerts?page=1&page_size=10&sort_by=created_at&sort_order=desc'
    )
  })

  it('fetchMonitoringDataV2: v2 聚合响应可被归一化（缺失 realtimeAlerts 也不应崩溃）', async () => {
    mockedApi.post.mockResolvedValue({
      data: {
        systemPerformance: [],
        temperatureHistory: [],
        deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
        networkTrafficHistory: [],
        statsV2: [],
        lastUpdate: '2026-03-15T00:00:00Z',
      },
      sections: {
        stats: { ok: true },
        systemPerformance: { ok: true },
        temperature: { ok: true },
        deviceStatus: { ok: true },
        networkTraffic: { ok: true },
        realtimeAlerts: { ok: true, limitedByPermission: true, requiredPermission: 'alerts:read' },
      },
      hasPartialFailure: false,
      failedSections: [],
      lastUpdate: '2026-03-15T00:00:00Z',
    })

    const envelope = await fetchMonitoringDataV2('24h')
    expect(mockedApi.post).toHaveBeenCalledWith('/monitoring/dashboard/v2', {
      time_range: '24h',
      alerts_limit: 10,
    })
    expect(envelope.sections.realtimeAlerts.limitedByPermission).toBe(true)
    expect(Array.isArray(envelope.data.realtimeAlerts)).toBe(true)
  })

  it('fetchMonitoringDataV2: 选择设备时应在请求体透传 device_ids', async () => {
    mockedApi.post.mockResolvedValue({
      data: {},
      sections: {},
      hasPartialFailure: false,
      failedSections: [],
      lastUpdate: '2026-03-15T00:00:00Z',
    })

    await fetchMonitoringDataV2('1h', [3, 7])
    expect(mockedApi.post).toHaveBeenCalledWith('/monitoring/dashboard/v2', {
      time_range: '1h',
      alerts_limit: 10,
      device_ids: [3, 7],
    })
  })

  it('fetchMonitoringDataV2: systemPerformance 按设备归一化为 devices:{名称:{cpu,memory}}，非法值被过滤', async () => {
    mockedApi.post.mockResolvedValue({
      data: {
        systemPerformance: [
          {
            timestamp: '2026-09-06T12:00:00Z',
            devices: {
              'SW-01': { cpu: 12.5, memory: 40 },
              'SW-02': { cpu: '20', memory: 'n/a' },
              '': { cpu: 1, memory: 1 },
              'BROKEN': 'not-an-object',
            },
          },
          { timestamp: '2026-09-06T12:05:00Z' },
          'garbage',
        ],
      },
      sections: {},
      hasPartialFailure: false,
      failedSections: [],
      lastUpdate: '2026-09-06T12:05:00Z',
    })

    const envelope = await fetchMonitoringDataV2('1h')
    expect(envelope.data.systemPerformance).toEqual([
      {
        timestamp: '2026-09-06T12:00:00Z',
        devices: {
          'SW-01': { cpu: 12.5, memory: 40 },
          'SW-02': { cpu: 20, memory: 0 },
        },
      },
      { timestamp: '2026-09-06T12:05:00Z', devices: {} },
    ])
  })

  it('fetchMonitoringDataV2: 旧版后端（v2 404）回退时，性能趋势分区应标记失败并提示升级', async () => {
    const { ApiClientError } = jest.requireMock('@/lib/api-client') as {
      ApiClientError: new (status: number, message?: string) => Error
    }
    mockedApi.post.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.reject(new ApiClientError(404, 'not found'))
      }
      if (url === '/monitoring/devices/temperature') {
        return Promise.resolve([{ timestamp: '2026-09-06T12:00:00Z', devices: { edge: 40 } }])
      }
      if (url === '/monitoring/network/traffic/history') {
        return Promise.resolve([])
      }
      return Promise.reject(new Error(`unexpected POST: ${url}`))
    })
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/monitoring/devices/distribution') {
        return Promise.resolve({ healthy: 1, warning: 0, critical: 0, offline: 0 })
      }
      if (url === '/monitoring/stats') {
        return Promise.resolve({ total_devices: 1, active_alerts: 0, avg_cpu: 10, avg_memory: 20 })
      }
      if (url.startsWith('/alerts')) {
        return Promise.resolve({ alerts: [] })
      }
      return Promise.reject(new Error(`unexpected GET: ${url}`))
    })

    const envelope = await fetchMonitoringDataV2('1h')
    expect(envelope.data.systemPerformance).toEqual([])
    expect(envelope.sections.systemPerformance.ok).toBe(false)
    expect(envelope.sections.systemPerformance.message).toContain('升级')
    expect(envelope.failedSections).toContain('systemPerformance')
    // 旧端点只有跨设备聚合值，给不出设备名，不应再请求它
    expect(mockedApi.post).not.toHaveBeenCalledWith('/monitoring/system/performance', expect.anything())
  })
})
