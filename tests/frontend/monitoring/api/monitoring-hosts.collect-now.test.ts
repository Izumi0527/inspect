import { api, ApiClientError } from '@/lib/api-client'
import {
  CollectCooldownError,
  DEVICE_COLLECT_NOW_TIMEOUT_MS,
  triggerDeviceCollectNow,
} from '@/features/monitoring/api/monitoring-hosts.api'

describe('monitoring-hosts.api triggerDeviceCollectNow', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('应显式透传 60s 单请求超时并解包 data', async () => {
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      success: true,
      data: {
        success: true,
        device_id: 42,
        metrics_written: 6,
        interfaces_written: 24,
        collection_time_ms: 1850,
      },
    })

    expect(DEVICE_COLLECT_NOW_TIMEOUT_MS).toBe(60_000)
    const result = await triggerDeviceCollectNow(42)

    expect(postSpy).toHaveBeenCalledWith(
      '/devices/42/collect-metrics',
      undefined,
      { timeout: 60_000 }
    )
    expect(result.device_id).toBe(42)
    expect(result.metrics_written).toBe(6)
  })

  it('遇 429 冷却响应时转换为 CollectCooldownError', async () => {
    jest.spyOn(api, 'post').mockRejectedValue(
      new ApiClientError({
        status: 429,
        type: 'cooldown_active',
        message: '采集冷却中，请 8 秒后再试',
        detail: { retry_after_seconds: 8 },
      })
    )

    await expect(triggerDeviceCollectNow(42)).rejects.toMatchObject({
      name: 'CollectCooldownError',
      status: 429,
      retryAfterSeconds: 8,
    })
    await expect(triggerDeviceCollectNow(42)).rejects.toBeInstanceOf(CollectCooldownError)
  })
})
