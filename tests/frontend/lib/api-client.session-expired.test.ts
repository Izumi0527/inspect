import { api, onSessionExpired, markSessionAlive } from '@/lib/api-client'

// 401 自愈里 refresh 失败 = 服务端会话已不存在，必须广播「会话已失效」，
// 让上层登出跳登录；否则页面会停在「每次请求都 401」的坏状态里。

const unauthorized = () =>
  new Response(JSON.stringify({ success: false, error: { message: 'Could not validate credentials' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

const ok = () =>
  new Response(JSON.stringify({ success: true, data: {} }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('api-client 会话失效广播', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    markSessionAlive()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('非认证端点 401 且续期失败时广播一次，后续失败不重复广播', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/auth/refresh') ? unauthorized() : unauthorized()
    ) as unknown as typeof fetch

    const listener = jest.fn()
    const unsubscribe = onSessionExpired(listener)

    await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    expect(listener).toHaveBeenCalledTimes(1)

    await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('认证端点自身的 401 不触发广播（避免与登录页探测互相干扰）', async () => {
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    const listener = jest.fn()
    const unsubscribe = onSessionExpired(listener)

    await expect(api.auth.profile()).rejects.toBeTruthy()
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('续期成功后重新武装：会话恢复后再失效仍能广播', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/auth/refresh') ? ok() : unauthorized()
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const listener = jest.fn()
    const unsubscribe = onSessionExpired(listener)

    // 第一次：401 → refresh 成功 → 重试仍 401 → 不广播（refresh 没失败）
    await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    expect(listener).not.toHaveBeenCalled()

    // 之后 refresh 也失败 → 广播
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch
    await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('取消订阅后不再收到广播', async () => {
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    const listener = jest.fn()
    onSessionExpired(listener)()

    await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    expect(listener).not.toHaveBeenCalled()
  })
})
