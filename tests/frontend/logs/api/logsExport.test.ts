import { exportLogs } from '@/features/logs/api/logsApi'
import { TokenManager } from '@/lib/api-client'

const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
}))

describe('logsApi exportLogs', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:38000'
    ;(TokenManager.getAccessToken as jest.Mock).mockReturnValue('manager-token')

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['csv']),
    } as Partial<Response>)
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl
    jest.restoreAllMocks()
  })

  it('应使用 /api/v1/logs/export 且携带 Authorization', async () => {
    await exportLogs({
      page: 1,
      page_size: 20,
      level: 'info',
      format: 'csv',
      include_raw: true,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('http://127.0.0.1:38000/api/v1/logs/export')
    expect(url).toContain('format=csv')
    expect(url).toContain('include_raw=true')

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit
    const headers = requestInit.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer manager-token')
  })
})
