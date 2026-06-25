import { authorizedDownload } from '@/lib/api-client'

describe('authorizedDownload', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('GET 携带 cookie 凭据且不发送 Authorization/CSRF', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok'))
    global.fetch = fetchMock as unknown as typeof fetch

    await authorizedDownload('/api/v1/export')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBeNull()
    expect(headers.get('X-CSRF-Token')).toBeNull()
  })

  it('POST 注入 X-CSRF-Token（取自 csrf_token cookie）且不发送 Authorization', async () => {
    document.cookie = 'csrf_token=tok-123'
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok'))
    global.fetch = fetchMock as unknown as typeof fetch

    await authorizedDownload('/api/v1/export', { method: 'POST', body: '{}' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
    const headers = init.headers as Headers
    expect(headers.get('X-CSRF-Token')).toBe('tok-123')
    expect(headers.get('Authorization')).toBeNull()
  })
})
