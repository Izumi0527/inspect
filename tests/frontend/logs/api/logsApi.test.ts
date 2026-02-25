import {
  batchDeleteLogs,
  getAllLogs,
  getLogStatistics,
  getParsingRules,
} from '@/features/logs/api/logsApi'

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
}))

describe('logsApi 响应解包兼容', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('getAllLogs 应兼容后端裸对象返回（非 {data:...}）', async () => {
    const payload = {
      items: [
        {
          id: 1,
          device_id: 10,
          level: 'info',
          facility: 'system',
          source: 'syslog',
          message: 'hello',
          log_timestamp: '2026-02-25T00:00:00Z',
          collected_at: '2026-02-25T00:00:00Z',
          created_at: '2026-02-25T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    }

    mockGet.mockResolvedValue(payload)

    const result = await getAllLogs({ page: 1, page_size: 20 })

    expect(result.total).toBe(1)
    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe(1)
  })

  it('getAllLogs 应兼容 {data:...} 包装返回', async () => {
    mockGet.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 0,
        has_next: false,
        has_prev: false,
      },
    })

    const result = await getAllLogs({ page: 1, page_size: 20 })

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('getLogStatistics 应兼容 {success:true,data:...} 包装返回', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        total_logs: 12,
        by_level: { info: 12 },
        by_facility: { system: 12 },
        by_device: { 10: 12 },
        trends: {},
        time_range_hours: 24,
      },
    })

    const result = await getLogStatistics(24)

    expect(result.total_logs).toBe(12)
    expect(result.by_level.info).toBe(12)
  })

  it('getParsingRules 应支持递归解包（data.data）', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            name: 'rule',
            pattern: '.*',
            vendor: 'cisco',
            is_active: true,
            priority: 1,
            created_at: '2026-02-25T00:00:00Z',
            updated_at: '2026-02-25T00:00:00Z',
          },
        ],
      },
    })

    const result = await getParsingRules()

    expect(result.length).toBe(1)
    expect(result[0].id).toBe(1)
  })

  it('batchDeleteLogs 应兼容后端裸 Map 返回（{deleted_count:N}）', async () => {
    mockPost.mockResolvedValue({ deleted_count: 3 })

    const result = await batchDeleteLogs([1, 2, 3])

    expect(result.deleted_count).toBe(3)
  })
})
