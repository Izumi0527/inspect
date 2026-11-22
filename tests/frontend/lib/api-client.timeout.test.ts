import { api, ApiClientError } from '@/lib/api-client'

describe('api-client 超时语义化错误', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('超时中止后应抛出 status=408、type=REQUEST_TIMEOUT 的中文 ApiClientError 且不触发 GET 重试', async () => {
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted')
            abortErr.name = 'AbortError'
            reject(abortErr)
          })
        })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const reqPromise = api.get('/devices/1/metrics', { timeout: 60000 })
    const assertion = expect(reqPromise).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 408,
      type: 'REQUEST_TIMEOUT',
      message: '请求超时（超过 60 秒），请稍后刷新查看',
    })

    await jest.advanceTimersByTimeAsync(60000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('非超时 AbortError 保持原始错误透传', async () => {
    const externalErr = new Error('Manual abort')
    externalErr.name = 'AbortError'
    global.fetch = jest.fn().mockRejectedValue(externalErr) as unknown as typeof fetch

    try {
      await api.post('/devices/1/collect-metrics', undefined, { timeout: 5000 })
      throw new Error('should have rejected')
    } catch (err) {
      expect(err).not.toBeInstanceOf(ApiClientError)
      expect(err).toBe(externalErr)
    }
  })
})
