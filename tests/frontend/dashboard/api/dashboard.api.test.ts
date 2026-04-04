import {
  fetchDashboardData,
  fetchDashboardNotificationsWithMeta,
  generateReport,
} from '@/features/dashboard/api/dashboard.api'

const mockPost = jest.fn()
const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('dashboard.api generateReport', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-27T00:00:00.000Z'))
    mockPost.mockResolvedValue({ success: true, data: { id: 1 } })
    mockGet.mockReset()
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

  it('应解析总览接口返回的分区权限元信息', async () => {
    mockGet.mockResolvedValueOnce({
      stats: [
        {
          title: '在线设备',
          value: '12',
          change: '',
          iconName: 'Monitor',
          iconColor: 'text-green-500',
          color: 'green',
        },
      ],
      recent_alerts: [],
      network_overview: [
        {
          name: '核心交换机',
          devices: 8,
          status: 'critical',
        },
      ],
      last_updated: '2026-02-27T00:00:00.000Z',
      sections: {
        stats: { ok: true },
        recentAlerts: {
          ok: true,
          limitedByPermission: true,
          requiredPermission: 'alerts:read',
        },
        networkOverview: { ok: false, message: '设备概览加载失败' },
      },
    })

    const result = await fetchDashboardData()

    expect(result.sections.recentAlerts.limitedByPermission).toBe(true)
    expect(result.sections.recentAlerts.requiredPermission).toBe('alerts:read')
    expect(result.sections.networkOverview.ok).toBe(false)
    expect(result.sections.networkOverview.message).toBe('设备概览加载失败')
    expect(result.networkOverview[0]?.status).toBe('critical')
  })

  it('总览接口失败时应向上抛错，而不是吞成空数据', async () => {
    mockGet.mockRejectedValueOnce(new Error('dashboard failed'))

    await expect(fetchDashboardData()).rejects.toThrow('dashboard failed')
  })

  it('通知接口失败时应向上抛错，交给调用方展示失败态', async () => {
    mockGet.mockRejectedValueOnce(new Error('notifications failed'))

    await expect(fetchDashboardNotificationsWithMeta()).rejects.toThrow('notifications failed')
  })
})
