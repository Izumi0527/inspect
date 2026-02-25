import { batchCollectLogs } from '@/features/logs/api/logsApi'

const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
}))

describe('logsApi batchCollectLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPost.mockResolvedValue({
      success: true,
      message: 'ok',
      collected_count: 0,
      device_id: 0,
    })
  })

  it('应透传 max_entries 与 max_concurrent 到后端', async () => {
    await batchCollectLogs([1, 2], {
      logType: 'system',
      maxEntries: 123,
      maxConcurrent: 7,
    } as any)

    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, payload] = mockPost.mock.calls[0]
    expect(url).toBe('/logs/batch-collect')
    expect(payload).toEqual({
      device_ids: [1, 2],
      log_type: 'system',
      max_entries: 123,
      max_concurrent: 7,
    })
  })
})

