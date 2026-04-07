import {
  fetchExecutionDetail,
  fetchInspectionStats,
  fetchInspectionTemplate,
} from '@/features/inspection/api/inspection.api'

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
  getApiOrigin: jest.fn(() => 'http://localhost:3000'),
}))

describe('inspection.api detail error handling', () => {
  beforeEach(() => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
    api.get.mockReset()
  })

  it.each([
    ['模板详情', () => fetchInspectionTemplate(1)],
    ['执行详情', () => fetchExecutionDetail('1')],
  ])('%s请求失败时应向上抛出错误', async (_label, request) => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
    api.get.mockRejectedValueOnce(new Error('网络异常'))

    await expect(request()).rejects.toThrow('网络异常')
  })

  it('统计卡片应优先使用 executionCount 字段，并兼容回填 todayExecutions', async () => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
    api.get.mockResolvedValueOnce({
      data: {
        totalStrategies: 8,
        activeStrategies: 5,
        executionCount: 12,
        successRate: 98,
        avgScore: 91.5,
        changes: {
          executionsChange: '+3.0%',
          successRateChange: '+1.0%',
          avgScoreChange: '+1.0%',
          strategiesChange: '0',
        },
        recentExecutions: [],
      },
    })

    const stats = await fetchInspectionStats({ period: 'week', startDate: '2026-04-01', endDate: '2026-04-06' })

    expect(stats.executionCount).toBe(12)
    expect(stats.todayExecutions).toBe(12)
  })
})
