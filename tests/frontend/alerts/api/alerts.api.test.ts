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
  TokenManager: {
    getAccessToken: jest.fn(),
  },
}))

describe('alerts.api exportAlerts', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL

  beforeEach(() => {
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
})
