import { exportAlerts } from '@/features/alerts/api/alerts.api'
import { TokenManager } from '@/lib/api-client'

jest.mock('@/lib/api-client', () => ({
  api: {
    alerts: {
      list: jest.fn(),
      get: jest.fn(),
      acknowledge: jest.fn(),
      resolve: jest.fn(),
    },
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
  API_PREFIX: '/api/v1',
  TokenManager: {
    getAccessToken: jest.fn(),
  },
  getApiOrigin: () => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:38000'
    const trimmed = String(raw).trim().replace(/\/+$/, '')
    return trimmed.replace(/\/api\/v1$/i, '')
  },
}))

describe('alerts.api exportAlerts', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL

  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockClear()
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:38000'
    ;(TokenManager.getAccessToken as jest.Mock).mockReturnValue('manager-token')

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'auth_token') {
        return 'legacy-token'
      }
      return null
    })

    window.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url')
    window.URL.revokeObjectURL = jest.fn()
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['csv']),
    } as Partial<Response>)
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl
    window.URL.createObjectURL = originalCreateObjectURL
    window.URL.revokeObjectURL = originalRevokeObjectURL
    jest.restoreAllMocks()
  })

  it('应使用 TokenManager 的 token 作为导出鉴权头', async () => {
    await exportAlerts({ page: 1, pageSize: 20 })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit
    const headers = requestInit.headers as Record<string, string>

    expect(headers.Authorization).toBe('Bearer manager-token')
  })

  it('当 NEXT_PUBLIC_API_URL 误配为包含 /api/v1 时，不应出现双前缀', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:38000/api/v1'

    await exportAlerts({ page: 1, pageSize: 20 })

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(calledUrl).toContain('http://127.0.0.1:38000/api/v1/alerts/export')
    expect(calledUrl).not.toContain('/api/v1/api/v1/')
  })
})
