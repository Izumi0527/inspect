import {
  createInspectionTemplate,
  fetchInspectionTemplate,
  fetchInspectionTemplates,
  updateInspectionTemplate,
} from '@/features/inspection/api/inspection.api'
import type { InspectionCheckItem } from '@/features/inspection/types'

jest.mock('@/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  TokenManager: { getAccessToken: jest.fn() },
  getApiOrigin: jest.fn(() => 'http://localhost:3000'),
}))

const { api } = jest.requireMock('@/lib/api-client') as {
  api: { get: jest.Mock; post: jest.Mock; put: jest.Mock }
}

const templateResponse = {
  data: {
    id: 7,
    name: '交换机巡检',
    category: 'network',
    device_types: ['switch'],
    check_items: [
      {
        id: 'bgp_peers', name: 'BGP 邻居状态', description: '检查 BGP 邻居是否全部建立',
        type: 'snmp', metric: 'bgp_peers', category: 'performance', weight: 10,
        enabled: false, device_types: ['router', 'firewall'], config: {},
      },
    ],
    is_default: true,
    is_active: true,
  },
}

const bgpItem: InspectionCheckItem = {
  id: 'bgp_peers', name: 'BGP 邻居状态', description: '检查 BGP 邻居是否全部建立',
  type: 'snmp', metric: 'bgp_peers', category: 'performance', weight: 10,
  enabled: false, deviceTypes: ['router', 'firewall'], config: {},
}

// 前端读模板再原样保存时不能丢字段：丢了 description 详情里就没有说明，
// 丢了 enabled 停用项会被悄悄启用，丢了检查项级 device_types 执行端就无从判断不适用。
describe('巡检模板字段契约', () => {
  it('读取时保留检查项的说明、分类、启用状态与适用类型', async () => {
    api.get.mockResolvedValue(templateResponse)

    const template = await fetchInspectionTemplate(7)

    expect(template.checkItems[0]).toEqual(expect.objectContaining({
      description: '检查 BGP 邻居是否全部建立',
      category: 'performance',
      enabled: false,
      deviceTypes: ['router', 'firewall'],
    }))
  })

  it('未声明 enabled 的存量检查项视为启用', async () => {
    api.get.mockResolvedValue({
      data: { ...templateResponse.data, check_items: [{ id: 'cpu', name: 'CPU', type: 'snmp', metric: 'cpu', config: {} }] },
    })
    const template = await fetchInspectionTemplate(7)
    expect(template.checkItems[0].enabled).toBe(true)
  })

  it('创建时原样提交这些字段，且从不提交 is_default（内置标记只由后端维护）', async () => {
    api.post.mockResolvedValue(templateResponse)

    await createInspectionTemplate({
      name: '自建交换机模板', description: '', category: 'network', deviceTypes: ['switch'],
      checkItems: [bgpItem], isBuiltIn: true, isActive: true,
    })

    const payload = api.post.mock.calls[0][1]
    expect(payload).not.toHaveProperty('is_default')
    expect(payload.check_items[0]).toEqual(expect.objectContaining({
      description: '检查 BGP 邻居是否全部建立',
      category: 'performance',
      enabled: false,
      device_types: ['router', 'firewall'],
      metric: 'bgp_peers',
    }))
  })

  it('更新时同样保留字段且不提交 is_default', async () => {
    api.put.mockResolvedValue(templateResponse)

    await updateInspectionTemplate(7, { name: 'x', deviceTypes: ['switch'], checkItems: [bgpItem], isBuiltIn: true })

    const payload = api.put.mock.calls[0][1]
    expect(payload).not.toHaveProperty('is_default')
    expect(payload.check_items[0]).toEqual(expect.objectContaining({ enabled: false, device_types: ['router', 'firewall'] }))
  })

  it('列表支持只取内置模板（快速创建与向导的检查项来源）', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } })

    await fetchInspectionTemplates({ isBuiltIn: true, pageSize: 100 })

    expect(api.get.mock.calls[0][0]).toContain('is_default=true')
  })
})
