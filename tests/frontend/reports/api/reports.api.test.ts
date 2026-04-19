import {
  generateInspectionReport,
  generateTrendReport,
  generateStatisticsReport,
  generateFromConfig,
  getKPIData,
  getRankings,
} from '@/features/reports/api/reports.api'

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

describe('reports.api 请求体适配', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('generateInspectionReport 应按后端 reportGenerateRequest(snake_case) 发送', async () => {
    mockPost.mockResolvedValue({ success: true, data: {} })

    await generateInspectionReport({
      title: '巡检报表-单测',
      description: 'desc',
      category: 'custom',
      dateRange: { startDate: '2026-02-01', endDate: '2026-02-02' },
      devices: ['1', '2', 'not-a-number'],
      strategies: ['s1'],
      executionIds: ['e1'],
      format: 'pdf',
      includeCharts: true,
      includeDetailData: false,
      includeRecommendations: true,
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    const [endpoint, body] = mockPost.mock.calls[0]

    expect(endpoint).toBe('/reports/inspection/generate')
    expect(body).toMatchObject({
      name: '巡检报表-单测',
      report_type: 'inspection',
      start_time: '2026-02-01',
      end_time: '2026-02-02',
      device_ids: [1, 2],
      include_charts: true,
      include_details: false,
      format: 'pdf',
      category: 'custom',
    })

    expect(body.custom_config).toMatchObject({
      description: 'desc',
      category: 'custom',
      strategies: ['s1'],
      execution_ids: ['e1'],
      include_recommendations: true,
    })
  })

  it('generateTrendReport 应按后端 reportGenerateRequest(snake_case) 发送', async () => {
    mockPost.mockResolvedValue({ success: true, data: {} })

    await generateTrendReport({
      title: '趋势报表-单测',
      metrics: ['availability', 'performance'],
      startDate: '2026-02-01T00:00:00Z',
      endDate: '2026-02-02T00:00:00Z',
      devices: ['3'],
      format: 'excel',
      includePredictions: true,
    })

    const [endpoint, body] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/reports/trends/generate')
    expect(body).toMatchObject({
      name: '趋势报表-单测',
      report_type: 'trend',
      start_time: '2026-02-01T00:00:00Z',
      end_time: '2026-02-02T00:00:00Z',
      device_ids: [3],
      include_charts: true,
      include_details: true,
      format: 'excel',
    })
    expect(body.custom_config).toMatchObject({
      metrics: ['availability', 'performance'],
      include_predictions: true,
    })
  })

  it('generateStatisticsReport 应按后端 reportGenerateRequest(snake_case) 发送', async () => {
    mockPost.mockResolvedValue({ success: true, data: {} })

    await generateStatisticsReport({
      title: '统计报表-单测',
      description: '统计desc',
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      deviceTypes: ['router'],
      locations: ['A'],
      format: 'word',
      includeCharts: false,
      includeTrends: true,
      includeRankings: false,
    })

    const [endpoint, body] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/reports/statistics/generate')
    expect(body).toMatchObject({
      name: '统计报表-单测',
      report_type: 'statistics',
      start_time: '2026-02-01',
      end_time: '2026-02-02',
      include_charts: false,
      include_details: true,
      format: 'word',
    })
    expect(body.custom_config).toMatchObject({
      description: '统计desc',
      device_types: ['router'],
      locations: ['A'],
      include_trends: true,
      include_rankings: false,
    })
  })

  it('getKPIData 应透传位置筛选参数到后端', async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: {
        inspection_completion_rate_change: '+0.0%',
        device_availability_change: '+0.0%',
        avg_health_score_change: '+0.0',
        severe_issue_count_change: '+0',
      },
    })

    await getKPIData({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      deviceTypes: ['router'],
      locations: ['A区'],
      comparisonPeriod: 'previous_period',
    })

    const [endpoint, body] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/reports/statistics/kpi')
    expect(body).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      deviceTypes: ['router'],
      locations: ['A区'],
      comparisonPeriod: 'previous_period',
    })
  })

  it('getRankings 应透传位置筛选参数到后端', async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: [],
    })

    await getRankings({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      deviceTypes: ['router'],
      locations: ['A区'],
      rankingType: 'performance',
      topN: 5,
      includeBottom: false,
    })

    const [endpoint, body] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/reports/statistics/rankings')
    expect(body).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      deviceTypes: ['router'],
      locations: ['A区'],
      rankingType: 'performance',
      topN: 5,
      includeBottom: false,
    })
  })

  it('generateFromConfig 应传递 format 字段到后端', async () => {
    mockPost.mockResolvedValue({ success: true, data: {} })

    await generateFromConfig(
      '12',
      {
        dateRange: { startDate: '2026-02-01', endDate: '2026-02-02' },
      } as any,
      'pdf'
    )

    const [endpoint, body] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/reports/custom/configs/12/generate')
    expect(body).toMatchObject({
      parameters: {
        dateRange: { startDate: '2026-02-01', endDate: '2026-02-02' },
      },
      format: 'pdf',
    })
  })
})
