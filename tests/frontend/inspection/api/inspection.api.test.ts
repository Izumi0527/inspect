import {
  copyInspectionTemplate,
  exportAnalyticsReport,
  fetchInspectionStrategies,
  fetchInspectionTemplate,
} from '@/features/inspection/api/inspection.api'
import { getApiOrigin, TokenManager } from '@/lib/api-client'

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
  authorizedDownload: (url: string, init?: RequestInit) =>
    (global.fetch as unknown as jest.Mock)(url, init),
}))

describe('inspection.api fetchInspectionTemplate', () => {
  it('应兼容 device_types 对象形态，并保留检查项 config 的扩展字段', async () => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }

    api.get.mockResolvedValue({
      data: {
        id: 1,
        name: 'Cisco SNMP 模板',
        description: '内置模板示例',
        category: 'network',
        device_types: {
          vendors: ['Cisco'],
          device_types: ['router'],
        },
        check_items: [
          {
            id: 'snmp-usage',
            name: 'CPU 使用率',
            type: 'snmp',
            weight: 1,
            enabled: true,
            config: {
              oid_used: '1.3.6.1.4.1.9.2.1.57.0',
              oid_free: '1.3.6.1.4.1.9.2.1.58.0',
              unit: '%',
              parsePattern: '(\\\\d+)',
              timeout: 3000,
            },
          },
        ],
        is_default: true,
        is_active: true,
        created_at: '2026-03-12T00:00:00Z',
        updated_at: '2026-03-12T00:00:00Z',
      },
    })

    const result = await fetchInspectionTemplate(1)
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.deviceTypes).toEqual(['router'])
    expect(result.checkItems).toHaveLength(1)
    expect(result.checkItems[0].config.unit).toBe('%')
    expect(result.checkItems[0].config.parsePattern).toBe('(\\\\d+)')
    expect(result.checkItems[0].config.oid_used).toBe('1.3.6.1.4.1.9.2.1.57.0')
    expect(result.checkItems[0].config.oid_free).toBe('1.3.6.1.4.1.9.2.1.58.0')
  })
})

describe('inspection.api copyInspectionTemplate', () => {
  it('应调用后端 copy API 并返回 transform 后的模板', async () => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { post: jest.Mock } }

    api.post.mockResolvedValue({
      data: {
        id: 2,
        name: 'Cisco SNMP 模板(副本)',
        description: '内置模板示例',
        category: 'network',
        deviceTypes: ['router'],
        checkItems: [],
        isBuiltIn: false,
        isActive: true,
        createdAt: '2026-03-12T00:00:00Z',
        updatedAt: '2026-03-12T00:00:00Z',
      },
    })

    const result = await copyInspectionTemplate(1, 'Cisco SNMP 模板(副本)')

    expect(api.post).toHaveBeenCalledWith('/inspection/templates/1/copy', { name: 'Cisco SNMP 模板(副本)' })
    expect(result.id).toBe('2')
    expect(result.name).toBe('Cisco SNMP 模板(副本)')
    expect(result.deviceTypes).toEqual(['router'])
  })
})

describe('inspection.api fetchInspectionStrategies', () => {
  it('应把 page/pageSize 转换为后端需要的 skip/limit 参数', async () => {
    const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }

    api.get.mockResolvedValue({
      data: {
        items: [
          {
            id: 7,
            name: '策略七',
            description: '分页测试',
            type: 'manual',
            devices: [1, 2],
            templates: [101],
            enabled: true,
            created_at: '2026-04-01T00:00:00Z',
            updated_at: '2026-04-01T00:00:00Z',
          },
        ],
        total: 45,
        pages: 3,
      },
    })

    const result = await fetchInspectionStrategies({ page: 3, pageSize: 20 })

    expect(api.get).toHaveBeenCalledWith('/inspection/strategies?skip=40&limit=20')
    expect(result.total).toBe(45)
    expect(result.pages).toBe(3)
    expect(result.strategies).toHaveLength(1)
    expect(result.strategies[0].id).toBe('7')
  })
})

describe('inspection.api exportAnalyticsReport', () => {
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL
  let appendedAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    appendedAnchor = null
    ;(getApiOrigin as jest.Mock).mockReturnValue('http://localhost:3000')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: () => null,
      },
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    } as Partial<Response>)
    ;(TokenManager.getAccessToken as jest.Mock).mockReturnValue('manager-token')

    window.URL.createObjectURL = jest.fn().mockReturnValue('blob:inspection-report')
    window.URL.revokeObjectURL = jest.fn()
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const originalAppendChild = document.body.appendChild.bind(document.body)
    jest.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
      if (node instanceof HTMLAnchorElement) {
        appendedAnchor = node
      }
      return originalAppendChild(node)
    }) as typeof document.body.appendChild)
  })

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL
    window.URL.revokeObjectURL = originalRevokeObjectURL
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('未显式指定格式时应默认请求并按中文前缀加紧凑日期时间命名 PDF 文件', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 10, 14, 30, 5))
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: (headerName: string) =>
          headerName.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="statistics_report_legacy.pdf"'
            : null,
      },
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    } as Partial<Response>)

    await exportAnalyticsReport({
      period: 'week',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      includeCharts: true,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/v1/inspection/analytics/export')
    expect(calledUrl).toContain('format_type=pdf')
    expect(calledUrl).not.toContain('format_type=excel')

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit
    expect(requestInit.method).toBe('POST')
    const headers = (requestInit.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBeUndefined()

    expect(appendedAnchor?.download).toBe('巡检统计分析报告_20260510143005.pdf')
  })
})
