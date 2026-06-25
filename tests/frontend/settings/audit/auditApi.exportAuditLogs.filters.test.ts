const mockFetch = jest.fn()

jest.mock('@/lib/api-client', () => ({
  API_PREFIX: '/api/v1',
  getApiOrigin: () => 'http://example.test',
  authorizedDownload: (url: string, init?: RequestInit) =>
    (global.fetch as unknown as jest.Mock)(url, init),
  httpClient: {
    get: jest.fn(),
  },
}))

import { auditApi } from '@/features/settings/api/audit.api'

describe('auditApi.exportAuditLogs filters 对齐', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // @ts-expect-error 测试环境注入 fetch mock
    global.fetch = mockFetch
  })

  it('应在导出请求中携带 keyword/resource/status 等筛选条件', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    await expect(
      auditApi.exportAuditLogs({
        keyword: 'login',
        resource: 'auth',
        status: 'failed',
      })
    ).rejects.toThrow('导出审计日志失败')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse((init as any).body)
    expect(body.filters.keyword).toBe('login')
    expect(body.filters.resource).toBe('auth')
    expect(body.filters.status).toBe('failed')
  })
})

