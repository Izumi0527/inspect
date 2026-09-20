import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NetworkTopologyGraph } from '@/features/dashboard/components/topology/NetworkTopologyGraph'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

const mockSaveTopologyLayout = jest.fn()
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('@/features/dashboard/api/dashboard.api', () => ({
  saveTopologyLayout: (...args: unknown[]) => mockSaveTopologyLayout(...args),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

// jsdom 20 没有 PointerEvent：补一个继承 MouseEvent 的最小实现，让 fireEvent.pointerDown 带上坐标
class PointerEventPolyfill extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, configurable: true })
  }
})

const node = (overrides: Partial<TopologyNode> & { id: number }): TopologyNode => ({
  name: `设备${overrides.id}`,
  ip: `10.0.0.${overrides.id}`,
  deviceType: 'switch',
  vendor: 'huawei',
  model: 'S5700',
  firmwareVersion: 'V200R001',
  status: 'online',
  unmanagedNeighbors: 0,
  ...overrides,
})

const threeNodeTopology: NetworkTopology = {
  nodes: [
    node({ id: 1, name: 'core', deviceType: 'switch', detectedType: 'router', model: 'S12700', firmwareVersion: 'V200R019', unmanagedNeighbors: 2 }),
    node({ id: 2, name: 'acc-1' }),
    node({ id: 3, name: 'fw', deviceType: 'firewall', status: 'offline' }),
  ],
  links: [
    { id: 'a', source: 1, target: 2, sourcePort: 'GigabitEthernet0/0/1', targetPort: 'GigabitEthernet0/0/24', bidirectional: true },
    { id: 'b', source: 3, target: 1, sourcePort: 'eth1', targetPort: 'GigabitEthernet0/0/2', bidirectional: false },
  ],
}

// 实验室场景：汇聚下挂五台接入，其中两台接入之间还有一条同层链路
const labTopology: NetworkTopology = {
  nodes: [
    node({ id: 1, name: '16F汇聚交换机' }),
    node({ id: 2, name: '16F接入交换机2' }),
    node({ id: 3, name: '16F接入交换机3' }),
    node({ id: 4, name: '16F门禁交换机' }),
    node({ id: 5, name: '16F商务部交换机' }),
    node({ id: 6, name: '16F财务部交换机' }),
  ],
  links: [
    { id: '1-2', source: 1, target: 2, sourcePort: 'GigabitEthernet0/0/52', targetPort: 'GigabitEthernet0/0/49', bidirectional: true },
    { id: '2-3', source: 2, target: 3, sourcePort: 'GigabitEthernet0/0/48', targetPort: 'GigabitEthernet0/0/48', bidirectional: true },
    { id: '1-4', source: 1, target: 4, sourcePort: 'GigabitEthernet0/0/1', targetPort: 'GigabitEthernet0/0/49', bidirectional: true },
    { id: '1-5', source: 1, target: 5, sourcePort: 'GigabitEthernet0/0/2', targetPort: 'GigabitEthernet0/0/49', bidirectional: true },
    { id: '1-6', source: 1, target: 6, sourcePort: 'GigabitEthernet0/0/3', targetPort: 'GigabitEthernet0/0/49', bidirectional: true },
  ],
}

const parseTranslate = (transform: string | null) => {
  const match = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(transform ?? '')
  if (!match) throw new Error(`no translate in ${transform}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

const parseScale = (transform: string | null) => {
  const match = /scale\(([-\d.]+)\)/.exec(transform ?? '')
  if (!match) throw new Error(`no scale in ${transform}`)
  return Number(match[1])
}

const dragFrom = (element: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
  fireEvent.pointerDown(element, { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y, pointerId: 1 })
}

describe('NetworkTopologyGraph', () => {
  beforeEach(() => {
    mockSaveTopologyLayout.mockImplementation(async (layout: { positions: unknown[] }) => ({
      positions: layout.positions,
      updatedAt: '2026-09-20T12:00:00Z',
      updatedBy: 'admin',
    }))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('每台设备渲染一个节点，每条 LLDP 链路渲染一条连线', () => {
    const { container } = render(<NetworkTopologyGraph topology={threeNodeTopology} />)

    expect(screen.getAllByRole('button', { name: /设备节点/ })).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="topology-link"]')).toHaveLength(2)
  })

  it('单侧可见的链路标记为非双向', () => {
    const { container } = render(<NetworkTopologyGraph topology={threeNodeTopology} />)
    const links = container.querySelectorAll('[data-testid="topology-link"]')
    const flags = Array.from(links).map((el) => el.getAttribute('data-bidirectional'))
    expect(flags.sort()).toEqual(['false', 'true'])
  })

  it('每条链路两端各标一个本端接口缩写，全称放在 title 里', () => {
    const { container } = render(<NetworkTopologyGraph topology={threeNodeTopology} />)
    const labels = Array.from(container.querySelectorAll('[data-testid="topology-link-port"]'))
    expect(labels.map((el) => el.textContent)).toEqual(
      expect.arrayContaining(['GE0/0/1', 'GE0/0/24', 'eth1', 'GE0/0/2'])
    )
    expect(labels).toHaveLength(4)
    const linkA = container.querySelector('[data-testid="topology-link"][data-link-id="a"]')
    expect(linkA?.querySelector('title')?.textContent).toContain('GigabitEthernet0/0/1')
    expect(linkA?.querySelector('title')?.textContent).toContain('GigabitEthernet0/0/24')
  })

  it('同一节点扇出多条链路时，该端的接口标签按距离错开，不叠在一起', () => {
    const { container } = render(<NetworkTopologyGraph topology={labTopology} />)
    const hub = parseTranslate(screen.getByRole('button', { name: '设备节点 16F汇聚交换机' }).getAttribute('transform'))
    const center = { x: hub.x + 48, y: hub.y + 48 }
    const hubPorts = ['GE0/0/52', 'GE0/0/1', 'GE0/0/2', 'GE0/0/3']
    const distances = Array.from(container.querySelectorAll('[data-testid="topology-link-port"]'))
      .filter((el) => hubPorts.includes(el.textContent ?? ''))
      .map((el) => {
        const at = parseTranslate(el.getAttribute('transform'))
        return Math.round(Math.hypot(at.x - center.x, at.y - center.y))
      })
    expect(distances).toHaveLength(4)
    expect(new Set(distances).size).toBeGreaterThanOrEqual(3)
    // 最近的标签也要在节点对角线之外，斜向链路的标签才不会被节点角盖住
    expect(Math.min(...distances)).toBeGreaterThan(68)
  })

  it('同层设备之间的链路画成弧线，跨层链路是直线', () => {
    const { container } = render(<NetworkTopologyGraph topology={labTopology} />)
    const curved = container.querySelector('[data-testid="topology-link"][data-link-id="2-3"]')
    const straight = container.querySelector('[data-testid="topology-link"][data-link-id="1-2"]')
    expect(curved?.getAttribute('data-curved')).toBe('true')
    expect(straight?.getAttribute('data-curved')).toBe('false')
  })

  it('画布左侧标出层级名，节点按角色分行', () => {
    render(<NetworkTopologyGraph topology={labTopology} />)
    const tierLabels = screen.getAllByTestId('topology-tier-label').map((el) => el.textContent)
    expect(tierLabels).toEqual(['汇聚', '接入'])

    const y = (name: string) => parseTranslate(screen.getByRole('button', { name: `设备节点 ${name}` }).getAttribute('transform')).y
    expect(y('16F汇聚交换机')).toBeLessThan(y('16F接入交换机2'))
    expect(y('16F接入交换机2')).toBe(y('16F财务部交换机'))
  })

  it('点击节点显示详情：识别类型与档案类型并列、层级来源、型号版本、链路端口', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} />)

    fireEvent.click(screen.getByRole('button', { name: /设备节点 core/ }))

    const detail = screen.getByTestId('topology-node-detail')
    expect(detail).toHaveTextContent('core')
    expect(detail).toHaveTextContent('10.0.0.1')
    expect(detail).toHaveTextContent('SNMP 识别：路由器')
    expect(detail).toHaveTextContent('档案类型：交换机')
    expect(detail).toHaveTextContent('层级：路由（按设备类型）')
    expect(detail).toHaveTextContent('S12700')
    expect(detail).toHaveTextContent('V200R019')
    expect(detail).toHaveTextContent('未纳管邻居 2 个')
    expect(detail).toHaveTextContent('GigabitEthernet0/0/1 ↔ acc-1 GigabitEthernet0/0/24')
    expect(detail).toHaveTextContent('GigabitEthernet0/0/2 ↔ fw eth1')
  })

  it('详情里的层级标注推断来源', () => {
    render(<NetworkTopologyGraph topology={labTopology} />)
    fireEvent.click(screen.getByRole('button', { name: '设备节点 16F汇聚交换机' }))
    expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('层级：汇聚（按名称识别）')
    fireEvent.click(screen.getByRole('button', { name: '设备节点 16F门禁交换机' }))
    expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('层级：接入（按拓扑推断）')
  })

  it('拖动空白处平移画布：视口平移量等于鼠标位移', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} />)
    const viewport = screen.getByTestId('topology-viewport')
    const before = parseTranslate(viewport.getAttribute('transform'))

    dragFrom(screen.getByTestId('topology-canvas-bg'), { x: 100, y: 100 }, { x: 140, y: 130 })

    const after = parseTranslate(viewport.getAttribute('transform'))
    expect(after.x - before.x).toBeCloseTo(40)
    expect(after.y - before.y).toBeCloseTo(30)
  })

  it('放大 / 缩小按钮改变缩放，适应画布恢复自动视口', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} />)
    const viewport = screen.getByTestId('topology-viewport')
    const initial = parseScale(viewport.getAttribute('transform'))

    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(parseScale(viewport.getAttribute('transform'))).toBeGreaterThan(initial)

    fireEvent.click(screen.getByRole('button', { name: '缩小' }))
    fireEvent.click(screen.getByRole('button', { name: '缩小' }))
    expect(parseScale(viewport.getAttribute('transform'))).toBeLessThan(initial)

    fireEvent.click(screen.getByRole('button', { name: '适应画布' }))
    expect(parseScale(viewport.getAttribute('transform'))).toBeCloseTo(initial)
  })

  it('无编辑权限时节点不可拖动、也没有保存按钮', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} />)
    const nodeEl = screen.getByRole('button', { name: /设备节点 core/ })
    const before = nodeEl.getAttribute('transform')

    dragFrom(nodeEl, { x: 100, y: 100 }, { x: 160, y: 140 })

    expect(nodeEl.getAttribute('transform')).toBe(before)
    expect(screen.queryByRole('button', { name: '保存布局' })).not.toBeInTheDocument()
  })

  it('有编辑权限时拖动节点改变位置，保存按钮变为可用并提交全部坐标', async () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} canEditLayout />)
    const save = screen.getByRole('button', { name: '保存布局' })
    expect(save).toBeDisabled()

    const nodeEl = screen.getByRole('button', { name: /设备节点 core/ })
    const before = parseTranslate(nodeEl.getAttribute('transform'))
    dragFrom(nodeEl, { x: 100, y: 100 }, { x: 160, y: 140 })
    const after = parseTranslate(nodeEl.getAttribute('transform'))
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeGreaterThan(before.y)
    // 拖动后不应触发选中
    expect(screen.queryByTestId('topology-node-detail')).not.toBeInTheDocument()

    expect(save).toBeEnabled()
    await act(async () => {
      fireEvent.click(save)
    })

    await waitFor(() => expect(mockSaveTopologyLayout).toHaveBeenCalledTimes(1))
    const payload = mockSaveTopologyLayout.mock.calls[0][0] as { positions: Array<{ deviceId: number; x: number; y: number }> }
    expect(payload.positions.map((p) => p.deviceId).sort()).toEqual([1, 2, 3])
    const core = payload.positions.find((p) => p.deviceId === 1)!
    expect(core.x).toBeCloseTo(after.x)
    expect(core.y).toBeCloseTo(after.y)
    expect(mockToastSuccess).toHaveBeenCalled()
    await waitFor(() => expect(save).toBeDisabled())
  })

  it('拖动一个节点之后，再点击另一个节点仍能正常选中', () => {
    jest.useFakeTimers()
    try {
      render(<NetworkTopologyGraph topology={threeNodeTopology} canEditLayout />)
      dragFrom(screen.getByRole('button', { name: /设备节点 core/ }), { x: 100, y: 100 }, { x: 160, y: 140 })
      // 真实浏览器里 pointerup 落在节点外时不会给节点派发 click，这里模拟这种情况：不派发 click
      act(() => {
        jest.runOnlyPendingTimers()
      })

      fireEvent.click(screen.getByRole('button', { name: /设备节点 acc-1/ }))
      expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('acc-1')
    } finally {
      jest.useRealTimers()
    }
  })

  it('自动适应状态下拖动节点，视口保持不动（不随包围盒重算而漂移）', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} canEditLayout />)
    const viewport = screen.getByTestId('topology-viewport')
    const before = viewport.getAttribute('transform')

    const nodeEl = screen.getByRole('button', { name: /设备节点 core/ })
    fireEvent.pointerDown(nodeEl, { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 500, pointerId: 1 })
    expect(viewport.getAttribute('transform')).toBe(before)
    fireEvent.pointerUp(window, { clientX: 400, clientY: 500, pointerId: 1 })
    expect(viewport.getAttribute('transform')).toBe(before)
  })

  it('总览刷新带回同样内容的布局时保留本地未保存的拖动；内容变化时才重新播种', () => {
    const saved = { positions: [{ deviceId: 1, x: 500, y: 700 }], updatedAt: '2026-09-20T09:00:00Z', updatedBy: 'ops' }
    const { rerender } = render(<NetworkTopologyGraph topology={{ ...threeNodeTopology, layout: saved }} canEditLayout />)
    const nodeEl = () => screen.getByRole('button', { name: /设备节点 core/ })
    dragFrom(nodeEl(), { x: 100, y: 100 }, { x: 160, y: 140 })
    const moved = parseTranslate(nodeEl().getAttribute('transform'))
    expect(moved).not.toEqual({ x: 500, y: 700 })

    // 同样的坐标、只是时间戳精度不同：视为同一份布局，不覆盖本地改动
    rerender(
      <NetworkTopologyGraph
        topology={{ ...threeNodeTopology, layout: { ...saved, updatedAt: '2026-09-20T09:00:00.000123Z' } }}
        canEditLayout
      />
    )
    expect(parseTranslate(nodeEl().getAttribute('transform'))).toEqual(moved)
    expect(screen.getByRole('button', { name: '保存布局' })).toBeEnabled()

    // 别人保存了新坐标：以服务端为准重新播种
    rerender(
      <NetworkTopologyGraph
        topology={{ ...threeNodeTopology, layout: { ...saved, positions: [{ deviceId: 1, x: 50, y: 60 }] } }}
        canEditLayout
      />
    )
    expect(parseTranslate(nodeEl().getAttribute('transform'))).toEqual({ x: 50, y: 60 })
    expect(screen.getByRole('button', { name: '保存布局' })).toBeDisabled()
  })

  it('保存失败时提示错误，保存按钮保持可用', async () => {
    mockSaveTopologyLayout.mockRejectedValueOnce(new Error('boom'))
    render(<NetworkTopologyGraph topology={threeNodeTopology} canEditLayout />)
    dragFrom(screen.getByRole('button', { name: /设备节点 core/ }), { x: 100, y: 100 }, { x: 160, y: 140 })

    const save = screen.getByRole('button', { name: '保存布局' })
    await act(async () => {
      fireEvent.click(save)
    })

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(save).toBeEnabled()
  })

  it('已保存的布局优先于自动布局，自动布局按钮把节点放回并标记为未保存', () => {
    const topology: NetworkTopology = {
      ...threeNodeTopology,
      layout: {
        positions: [{ deviceId: 1, x: 500, y: 700 }],
        updatedAt: '2026-09-20T09:00:00Z',
        updatedBy: 'ops',
      },
    }
    render(<NetworkTopologyGraph topology={topology} canEditLayout />)
    const nodeEl = screen.getByRole('button', { name: /设备节点 core/ })
    expect(parseTranslate(nodeEl.getAttribute('transform'))).toEqual({ x: 500, y: 700 })
    expect(screen.getByRole('button', { name: '保存布局' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '自动布局' }))
    expect(parseTranslate(nodeEl.getAttribute('transform'))).not.toEqual({ x: 500, y: 700 })
    expect(screen.getByRole('button', { name: '保存布局' })).toBeEnabled()
  })

  it('有节点但没有链路时给出 LLDP 提示', () => {
    render(<NetworkTopologyGraph topology={{ nodes: [node({ id: 1 }), node({ id: 2 })], links: [] }} />)

    expect(screen.getAllByRole('button', { name: /设备节点/ })).toHaveLength(2)
    expect(screen.getByText(/尚未发现 LLDP 链路/)).toBeInTheDocument()
  })

  it('没有链路时按采集判定分组解释原因，并给出华为设备的放行命令', () => {
    render(
      <NetworkTopologyGraph
        topology={{
          nodes: [
            node({ id: 1, name: '16F汇聚交换机', lldpStatus: 'mib_unreachable' }),
            node({ id: 2, name: '16F接入交换机2', lldpStatus: 'mib_unreachable' }),
            node({ id: 3, name: '16F门禁交换机', lldpStatus: 'disabled' }),
            node({ id: 4, name: '16F商务部交换机', lldpStatus: 'ok' }),
          ],
          links: [],
        }}
      />
    )

    const hint = screen.getByTestId('topology-empty-hint')
    expect(hint).toHaveTextContent('2 台设备的 SNMP 视图未放行 LLDP-MIB（1.0.8802.1.1.2）')
    expect(hint).toHaveTextContent('16F汇聚交换机、16F接入交换机2')
    expect(hint).toHaveTextContent('snmp-agent mib-view included iso-view iso')
    expect(hint).toHaveTextContent('snmp-agent community read <community> mib-view iso-view')
    expect(hint).toHaveTextContent('1 台设备未全局启用 LLDP')
    expect(hint).toHaveTextContent('16F门禁交换机')
    expect(hint).toHaveTextContent('lldp enable')
    expect(hint).not.toHaveTextContent('16F商务部交换机')
  })

  it('LLDP 采集正常但邻居都没匹配到台账时，提示核对台账身份', () => {
    render(
      <NetworkTopologyGraph
        topology={{
          nodes: [
            node({ id: 1, name: '16F汇聚交换机', lldpStatus: 'ok', unmanagedNeighbors: 3 }),
            node({ id: 2, name: '16F接入交换机2', lldpStatus: 'ok' }),
          ],
          links: [],
        }}
      />
    )

    const hint = screen.getByTestId('topology-empty-hint')
    expect(hint).toHaveTextContent('1 台设备读到了 LLDP 邻居但都没匹配到台账设备')
    expect(hint).toHaveTextContent('16F汇聚交换机')
    expect(hint).toHaveTextContent('管理 IP')
    expect(hint).not.toHaveTextContent('snmp-agent mib-view')
  })

  it('节点详情显示 LLDP 采集判定', () => {
    render(
      <NetworkTopologyGraph
        topology={{
          nodes: [node({ id: 1, name: 'core', lldpStatus: 'mib_unreachable' }), node({ id: 2, name: 'acc' })],
          links: [],
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /设备节点 core/ }))
    expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('LLDP：SNMP 视图未放行')

    fireEvent.click(screen.getByRole('button', { name: /设备节点 acc/ }))
    expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('LLDP：尚未采集')
  })
})
