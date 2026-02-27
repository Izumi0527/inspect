import { generateReport } from '@/features/dashboard/api/dashboard.api'

const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('dashboard.api generateReport', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-27T00:00:00.000Z'))
    mockPost.mockResolvedValue({ success: true, data: { id: 1 } })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('应调用 /reports/generate 并使用后端 reportGenerateRequest 结构', async () => {
    await generateReport('inspection-summary')

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith(
      '/reports/generate',
      expect.objectContaining({
        report_type: 'inspection_summary',
        format: 'pdf',
        category: 'weekly',
        start_time: '2026-02-20T00:00:00.000Z',
        end_time: '2026-02-27T00:00:00.000Z',
      })
    )
  })
})

