import {
  fetchDashboardData,
  fetchDashboardNotificationsWithMeta,
  generateReport,
  saveTopologyLayout,
} from '@/features/dashboard/api/dashboard.api'

const mockPost = jest.fn()
const mockGet = jest.fn()
const mockPut = jest.fn()

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
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
      active_alerts: [
        { id: 9, device: 'core-sw', message: 'CPU 过高', severity: 'critical', time: '2026-02-27T00:00:00.000Z' },
      ],
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
        activeAlerts: {
          ok: true,
          limitedByPermission: true,
          requiredPermission: 'alerts:read',
        },
        networkOverview: { ok: false, message: '设备概览加载失败' },
      },
    })

    const result = await fetchDashboardData()

    expect(result.activeAlerts).toEqual([
      { id: 9, device: 'core-sw', message: 'CPU 过高', severity: 'high', time: '2026-02-27T00:00:00.000Z', category: undefined },
    ])
    expect(result.sections.activeAlerts.limitedByPermission).toBe(true)
    expect(result.sections.activeAlerts.requiredPermission).toBe('alerts:read')
    expect(result.sections.networkOverview.ok).toBe(false)
    expect(result.sections.networkOverview.message).toBe('设备概览加载失败')
    expect(result.networkOverview[0]?.status).toBe('critical')
  })

  it('应解析 statsInspections 分区失败状态', async () => {
    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [],
      network_overview: [],
      sections: { statsInspections: { ok: false, message: '巡检统计加载失败' } },
    })

    const result = await fetchDashboardData()

    expect(result.sections.statsInspections.ok).toBe(false)
    expect(result.sections.statsInspections.message).toBe('巡检统计加载失败')
  })

  it('应解析 active_alerts_total；缺失时退回为列表长度', async () => {
    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [{ id: 1, device: 'a', message: 'm', severity: 'info', time: '2026-09-20T00:00:00Z' }],
      active_alerts_total: 25,
      network_overview: [],
    })
    expect((await fetchDashboardData()).activeAlertsTotal).toBe(25)

    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [{ id: 1, device: 'a', message: 'm', severity: 'info', time: '2026-09-20T00:00:00Z' }],
      network_overview: [],
    })
    expect((await fetchDashboardData()).activeAlertsTotal).toBe(1)
  })

  it('应把 network_topology 映射为节点与链路，缺失时给空拓扑', async () => {
    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [],
      network_overview: [],
      network_topology: {
        nodes: [
          {
            id: 1,
            name: 'core',
            ip: '10.0.0.1',
            device_type: 'switch',
            detected_type: 'router',
            vendor: 'huawei',
            model: 'S12700',
            firmware_version: 'V200R019',
            status: 'online',
            unmanaged_neighbors: 2,
            lldp_status: 'mib_unreachable',
          },
          { id: 2, name: 'acc', ip: '10.0.0.2', device_type: 'switch', status: 'weird', unmanaged_neighbors: 0, lldp_status: 'bogus' },
        ],
        links: [
          { id: '1:G1|2:', source: 1, target: 2, source_port: 'G1', target_port: '', bidirectional: false },
        ],
      },
    })

    const result = await fetchDashboardData()

    expect(result.networkTopology.nodes).toHaveLength(2)
    expect(result.networkTopology.nodes[0]).toEqual({
      id: 1,
      name: 'core',
      ip: '10.0.0.1',
      deviceType: 'switch',
      detectedType: 'router',
      vendor: 'huawei',
      model: 'S12700',
      firmwareVersion: 'V200R019',
      status: 'online',
      unmanagedNeighbors: 2,
      lldpStatus: 'mib_unreachable',
    })
    expect(result.networkTopology.nodes[1]?.status).toBe('unknown')
    expect(result.networkTopology.nodes[1]?.detectedType).toBeUndefined()
    expect(result.networkTopology.nodes[1]?.lldpStatus).toBeUndefined()
    expect(result.networkTopology.links).toEqual([
      { id: '1:G1|2:', source: 1, target: 2, sourcePort: 'G1', targetPort: '', bidirectional: false },
    ])

    mockGet.mockResolvedValueOnce({ stats: [], active_alerts: [], network_overview: [] })
    const fallback = await fetchDashboardData()
    expect(fallback.networkTopology).toEqual({ nodes: [], links: [] })
  })

  it('应把 network_topology.layout 映射为已保存布局，非法坐标条目丢弃，缺失时不带 layout', async () => {
    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [],
      network_overview: [],
      network_topology: {
        nodes: [],
        links: [],
        layout: {
          positions: [
            { device_id: 1, x: 10, y: 20 },
            { device_id: 'bad', x: 1, y: 2 },
            { device_id: 2, x: 'nan', y: 2 },
          ],
          viewport: { x: 5, y: 6, k: 1.5 },
          updated_at: '2026-09-20T10:00:00Z',
          updated_by: 'u-1',
        },
      },
    })

    const result = await fetchDashboardData()
    expect(result.networkTopology.layout).toEqual({
      positions: [{ deviceId: 1, x: 10, y: 20 }],
      viewport: { x: 5, y: 6, k: 1.5 },
      updatedAt: '2026-09-20T10:00:00Z',
      updatedBy: 'u-1',
    })

    mockGet.mockResolvedValueOnce({
      stats: [],
      active_alerts: [],
      network_overview: [],
      network_topology: { nodes: [], links: [] },
    })
    const withoutLayout = await fetchDashboardData()
    expect(withoutLayout.networkTopology.layout).toBeUndefined()
  })

  it('saveTopologyLayout 以后端字段名 PUT 到布局端点，并把响应映射回前端结构', async () => {
    mockPut.mockResolvedValueOnce({
      positions: [{ device_id: 3, x: 1, y: 2 }],
      viewport: { x: 0, y: 0, k: 1 },
      updated_at: '2026-09-20T11:00:00Z',
      updated_by: 'u-2',
    })

    const saved = await saveTopologyLayout({
      positions: [{ deviceId: 3, x: 1, y: 2 }],
      viewport: { x: 0, y: 0, k: 1 },
    })

    expect(mockPut).toHaveBeenCalledWith('/dashboard/network-topology/layout', {
      positions: [{ device_id: 3, x: 1, y: 2 }],
      viewport: { x: 0, y: 0, k: 1 },
    })
    expect(saved).toEqual({
      positions: [{ deviceId: 3, x: 1, y: 2 }],
      viewport: { x: 0, y: 0, k: 1 },
      updatedAt: '2026-09-20T11:00:00Z',
      updatedBy: 'u-2',
    })
  })

  it('总览接口失败时应向上抛错，而不是吞成空数据', async () => {
    mockGet.mockRejectedValueOnce(new Error('dashboard failed'))

    await expect(fetchDashboardData()).rejects.toThrow('dashboard failed')
  })

  it('通知接口失败时应向上抛错，交给调用方展示失败态', async () => {
    mockGet.mockRejectedValueOnce(new Error('notifications failed'))

    await expect(fetchDashboardNotificationsWithMeta()).rejects.toThrow('notifications failed')
  })

  it('通知接口应把标签页类型作为 type 查询参数下发，不传时只带 limit', async () => {
    mockGet.mockResolvedValue({ notifications: [], unread_count: 0 })

    await fetchDashboardNotificationsWithMeta(20, 'system')
    expect(mockGet).toHaveBeenLastCalledWith('/dashboard/notifications?limit=20&type=system')

    await fetchDashboardNotificationsWithMeta(20)
    expect(mockGet).toHaveBeenLastCalledWith('/dashboard/notifications?limit=20')
  })

  it('通知接口应解析告警状态字段，非法值与缺失值都归为 undefined', async () => {
    mockGet.mockResolvedValue({
      notifications: [
        { id: 'alert-1', type: 'alert', title: 'a', content: '', timestamp: '2026-09-18T00:00:00Z', status: 'resolved' },
        { id: 'alert-2', type: 'alert', title: 'b', content: '', timestamp: '2026-09-18T00:00:00Z', status: 'ACKNOWLEDGED' },
        { id: 'alert-3', type: 'alert', title: 'c', content: '', timestamp: '2026-09-18T00:00:00Z', status: 'bogus' },
        { id: 'report-1', type: 'system', title: 'd', content: '', timestamp: '2026-09-18T00:00:00Z' },
      ],
      unread_count: 4,
    })

    const result = await fetchDashboardNotificationsWithMeta(20)
    expect(result.notifications.map((n) => n.status)).toEqual(['resolved', 'acknowledged', undefined, undefined])
  })
})
