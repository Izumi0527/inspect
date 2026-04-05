import {
  fetchInspectionTemplates,
  fetchInspectionStrategies,
  fetchInspectionExecutions,
  fetchInspectionStats,
  fetchInspectionTrends,
  fetchDeviceDistribution,
  fetchProblemDistribution,
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

describe('inspection.api error handling', () => {
  beforeEach(() => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
    api.get.mockReset()
  })

  it.each([
    ['模板列表', () => fetchInspectionTemplates()],
    ['策略列表', () => fetchInspectionStrategies()],
    ['执行列表', () => fetchInspectionExecutions()],
    ['统计卡片', () => fetchInspectionStats({ period: 'week', startDate: '2026-03-01', endDate: '2026-03-31' })],
    ['趋势图', () => fetchInspectionTrends({ period: 'week', startDate: '2026-03-01', endDate: '2026-03-31' })],
    ['设备分布', () => fetchDeviceDistribution({ period: 'week', startDate: '2026-03-01', endDate: '2026-03-31' })],
    ['问题分布', () => fetchProblemDistribution({ period: 'week', startDate: '2026-03-01', endDate: '2026-03-31' })],
  ])('请求%s失败时应向上抛出错误', async (_label, request) => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
    api.get.mockRejectedValueOnce(new Error('网络异常'))

    await expect(request()).rejects.toThrow('网络异常')
  })
})
