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
  API_PREFIX: '/api/v1',
  getApiOrigin: () => process.env.NEXT_PUBLIC_API_URL || '',
  authorizedDownload: (url: string, init?: RequestInit) =>
    (global.fetch as unknown as jest.Mock)(url, init),
  TokenManager: {
    getAccessToken: jest.fn(),
  },
}))

describe('logsApi exportLogs', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:9000'
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

  it('应使用 /api/v1/logs/export，且不发送 Authorization（改用 Cookie）', async () => {
    await exportLogs({
      page: 1,
      page_size: 20,
      level: 'info',
      format: 'csv',
      include_raw: true,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('http://127.0.0.1:9000/api/v1/logs/export')
    expect(url).toContain('format=csv')
    expect(url).toContain('include_raw=true')

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit | undefined
    const headers = (requestInit?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('后端返回 JSON 错误时应包含状态码与 message', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: '权限不足' }),
      text: async () => '',
    } as Partial<Response>)

    await expect(
      exportLogs({
        page: 1,
        page_size: 20,
        level: 'info',
        format: 'csv',
        include_raw: true,
      }),
    ).rejects.toThrow('导出失败（403）：权限不足')
  })

  it('后端返回文本错误时应包含状态码与文本内容', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => 'text/plain' },
      text: async () => 'device_ids 超过限制',
    } as Partial<Response>)

    await expect(
      exportLogs({
        page: 1,
        page_size: 20,
        level: 'info',
        format: 'csv',
        include_raw: true,
      }),
    ).rejects.toThrow('导出失败（400）：device_ids 超过限制')
  })

  it('后端返回嵌套 error.message 时应透出具体错误信息', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        error: {
          type: 'HTTPException',
          message: 'no logs found',
        },
      }),
      text: async () => '',
    } as Partial<Response>)

    await expect(
      exportLogs({
        page: 1,
        page_size: 20,
        format: 'csv',
        include_raw: true,
      }),
    ).rejects.toThrow('导出失败（404）：no logs found')
  })

  it('无 token 时不应发送空 Authorization 头', async () => {
    ;(TokenManager.getAccessToken as jest.Mock).mockReturnValue('')

    await exportLogs({
      page: 1,
      page_size: 20,
      level: 'info',
      format: 'csv',
      include_raw: true,
    })

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit | undefined
    const headers = (requestInit?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})
