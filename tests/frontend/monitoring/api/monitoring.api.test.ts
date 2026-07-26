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
})
