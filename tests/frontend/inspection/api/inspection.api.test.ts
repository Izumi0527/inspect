import { copyInspectionTemplate, fetchInspectionTemplate } from '@/features/inspection/api/inspection.api'

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
