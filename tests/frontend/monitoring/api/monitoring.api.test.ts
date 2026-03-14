import { fetchMonitoringDataV2 } from '@/features/monitoring/api/monitoring.api'
import { ApiClientError } from '@/lib/api-client'

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => {
  class ApiClientError extends Error {
    public status: number
    public type: string
    public detail?: unknown

    constructor(error: { message: string; type: string; detail?: unknown; status: number }) {
      super(error.message)
      this.name = 'ApiClientError'
      this.status = error.status
      this.type = error.type
      this.detail = error.detail
    }
  }

  return {
    ApiClientError,
    api: {
      get: (...args: unknown[]) => mockGet(...args),
      post: (...args: unknown[]) => mockPost(...args),
    },
  }
})

describe('monitoring.api fetchMonitoringDataV2', () => {
  const now = '2026-02-24T12:00:00.000Z'

  beforeEach(() => {
    jest.clearAllMocks()

    mockGet.mockImplementation((url: string) => {
      if (url === '/monitoring/devices/distribution') {
        return Promise.resolve({ healthy: 3, warning: 1, critical: 0, offline: 0 })
      }
      if (url === '/monitoring/availability') {
        return Promise.resolve({ current: 99.5, target: 99.9, trend: 'stable', last_update: now })
      }
      if (url === '/monitoring/stats') {
        return Promise.resolve({
          total_devices: 4,
          availability: 99.5,
          active_alerts: 1,
          avg_cpu: 22.5,
          avg_memory: 48.3,
          avg_network: 1200000,
        })
      }
      if (url.startsWith('/alerts/')) {
        return Promise.resolve({
          alerts: [
            {
              id: 1,
              device_name: 'core-sw-01',
              message: 'CPU 偏高',
              severity: 'warning',
              created_at: now,
            },
          ],
        })
      }
      return Promise.reject(new Error(`unexpected GET: ${url}`))
    })

    mockPost.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.reject(new ApiClientError({ message: 'not found', type: 'not_found', status: 404 }))
      }
      if (url === '/monitoring/system/performance') {
        return Promise.resolve([
          { timestamp: now, cpu_usage: 20, memory_usage: 40, network_traffic: 1.2 },
        ])
      }
      if (url === '/monitoring/devices/temperature') {
        return Promise.resolve([
          { timestamp: now, devices: { 'core-sw-01': 45 } },
        ])
      }
      if (url === '/monitoring/network/traffic/history') {
        return Promise.resolve([
          { timestamp: now, inbound: 2.4, outbound: 1.8 },
        ])
      }
      return Promise.reject(new Error(`unexpected POST: ${url}`))
    })
  })

  it('部分接口失败时应返回分区降级结果并标记失败分区', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.reject(new ApiClientError({ message: 'not found', type: 'not_found', status: 404 }))
      }
      if (url === '/monitoring/network/traffic/history') {
        return Promise.reject(new Error('traffic endpoint down'))
      }
      if (url === '/monitoring/system/performance') {
        return Promise.resolve([
          { timestamp: now, cpu_usage: 20, memory_usage: 40, network_traffic: 1.2 },
        ])
      }
      if (url === '/monitoring/devices/temperature') {
        return Promise.resolve([
          { timestamp: now, devices: { 'core-sw-01': 45 } },
        ])
      }
      return Promise.reject(new Error(`unexpected POST: ${url}`))
    })

    const result = await fetchMonitoringDataV2('24h')

    expect(result.hasPartialFailure).toBe(true)
    expect(result.failedSections).toContain('networkTraffic')
    expect(result.sections.networkTraffic.ok).toBe(false)
    expect(result.sections.stats.ok).toBe(true)
    expect(result.data.statsV2).toBeDefined()
    expect((result.data.statsV2 ?? []).length).toBeGreaterThan(0)
  })

  it('全部接口失败时应抛出错误，触发全页错误态', async () => {
    mockGet.mockRejectedValue(new Error('all get failed'))
    mockPost.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.reject(new ApiClientError({ message: 'not found', type: 'not_found', status: 404 }))
      }
      return Promise.reject(new Error(`all post failed: ${url}`))
    })

    await expect(fetchMonitoringDataV2('24h')).rejects.toThrow('监控数据加载失败')
  })

  it('聚合接口字段类型不一致时应做安全规范化', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/monitoring/dashboard/v2') {
        return Promise.resolve({
          data: {
            systemPerformance: [{ timestamp: now, cpu: '20', memory: '40', network: '1.2' }],
            temperatureHistory: [{ timestamp: now, devices: { 'core-sw-01': '45', bad: 'x' } }],
            deviceStatusDistribution: { healthy: '3', warning: 1, critical: null, offline: undefined },
            availability: { current: '99.5', target: '99.9', trend: 'UP', lastUpdate: now },
            networkTrafficHistory: [{ timestamp: now, inbound: '2.4', outbound: 1.8 }],
            statsV2: [
              { id: 'total_devices', title: '总设备', value: 4 },
              { id: '  ', title: '  ', value: null },
            ],
            realtimeAlerts: [
              { id: '1', deviceName: 'core-sw-01', message: 'CPU 偏高', severity: 'fatal', time: now },
            ],
            lastUpdate: now,
          },
          sections: {
            stats: { ok: true },
            systemPerformance: { ok: true },
            temperature: { ok: true },
            deviceStatus: { ok: true },
            availability: { ok: true },
            networkTraffic: { ok: true },
            realtimeAlerts: { ok: true },
          },
          hasPartialFailure: false,
          failedSections: [],
          lastUpdate: now,
        })
      }
      return Promise.reject(new Error(`unexpected POST: ${url}`))
    })

    const result = await fetchMonitoringDataV2('24h')

    expect(result.hasPartialFailure).toBe(false)
    expect(result.failedSections).toEqual([])
    expect(result.sections.realtimeAlerts.ok).toBe(true)

    expect(result.data.systemPerformance[0]).toEqual({
      timestamp: now,
      cpu: 20,
      memory: 40,
      network: 1.2,
    })

    expect(result.data.temperatureHistory[0].devices).toEqual({ 'core-sw-01': 45 })
    expect(result.data.deviceStatusDistribution).toEqual({ healthy: 3, warning: 1, critical: 0, offline: 0 })
    expect(result.data.availability.trend).toBe('up')
    expect(result.data.networkTrafficHistory[0].inbound).toBe(2.4)
    expect(result.data.statsV2?.[0].value).toBe(4)
    expect(result.data.statsV2?.[1].id).toBe('stat_1')

    expect(result.data.realtimeAlerts?.[0]).toEqual(expect.objectContaining({
      id: 1,
      deviceName: 'core-sw-01',
      message: 'CPU 偏高',
      severity: 'critical',
    }))
    expect(result.data.realtimeAlerts?.[0].time).not.toBe('-')
  })
})
