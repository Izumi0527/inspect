import { batchProbeDevices, probeDevice } from '@/features/devices/api/devices.api'

const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiClientError: class ApiClientError extends Error {},
}))

const probeResult = {
  device_id: 1,
  ip_address: '10.0.0.1',
  icmp_reachable: true,
  snmp_reachable: false,
  probed_at: '2026-09-03T00:00:00Z',
}

const timeoutOf = (callIndex: number): number | undefined => {
  const config = mockPost.mock.calls[callIndex]?.[2] as { timeout?: number } | undefined
  return config?.timeout
}

// 后端 ProbeDevice 要等 ICMP（ping -W 3）与 SNMP（5s × 3 次）都结束，最坏约 15s；
// httpClient 默认 10s 会先 abort，把后端已算出的结果与错误原因一起吞掉。
describe('devices.api 探测请求超时须覆盖后端最坏耗时', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('probeDevice 单设备探测显式给 30s 超时', async () => {
    mockPost.mockResolvedValueOnce(probeResult)

    await probeDevice(1)

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(timeoutOf(0)).toBe(30000)
  })

  it('batchProbeDevices 按并发轮次放大：1 台 → 25s', async () => {
    mockPost.mockResolvedValueOnce({ total: 1, probed: 1, results: [probeResult] })

    await batchProbeDevices([1], { maxConcurrent: 20 })

    expect(timeoutOf(0)).toBe(25000)
  })

  it('batchProbeDevices 45 台 / 并发 20 → 3 轮 → 55s', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => i + 1)
    mockPost.mockResolvedValueOnce({ total: 45, probed: 45, results: [] })

    await batchProbeDevices(ids, { maxConcurrent: 20 })

    expect(timeoutOf(0)).toBe(55000)
  })

  it('batchProbeDevices 超时封顶 120s，避免大批量把请求挂成永久等待', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
    mockPost.mockResolvedValueOnce({ total: 1000, probed: 1000, results: [] })

    await batchProbeDevices(ids, { maxConcurrent: 20 })

    expect(timeoutOf(0)).toBe(120000)
  })
})
