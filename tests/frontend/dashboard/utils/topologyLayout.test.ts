import {
  GAP_Y,
  ISOLATED_TIER,
  layoutTopology,
  ROLE_TIER,
  TIER_LABELS,
} from '@/features/dashboard/utils/topologyLayout'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

const node = (id: number, type: string, detected?: string, name = `n${id}`): TopologyNode => ({
  id,
  name,
  ip: `10.0.0.${id}`,
  deviceType: type,
  detectedType: detected,
  vendor: '',
  model: '',
  firmwareVersion: '',
  status: 'online',
  unmanagedNeighbors: 0,
})

const link = (source: number, target: number) => ({
  id: `${source}-${target}`,
  source,
  target,
  sourcePort: '',
  targetPort: '',
  bidirectional: true,
})

describe('topologyLayout', () => {
  it('层级顺序：防火墙 < 路由 < 核心 < 汇聚 < 接入 < 终端 < 未连接', () => {
    expect(ROLE_TIER.firewall).toBeLessThan(ROLE_TIER.router)
    expect(ROLE_TIER.router).toBeLessThan(ROLE_TIER.core)
    expect(ROLE_TIER.core).toBeLessThan(ROLE_TIER.aggregation)
    expect(ROLE_TIER.aggregation).toBeLessThan(ROLE_TIER.access)
    expect(ROLE_TIER.access).toBeLessThan(ROLE_TIER.edge)
    expect(ROLE_TIER.edge).toBeLessThan(ISOLATED_TIER)
    expect(TIER_LABELS[ROLE_TIER.core]).toBe('核心')
    expect(TIER_LABELS[ROLE_TIER.aggregation]).toBe('汇聚')
    expect(TIER_LABELS[ROLE_TIER.access]).toBe('接入')
  })

  it('串联的四类设备落在递增的层，y 随层递增', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'firewall'), node(2, 'router'), node(3, 'switch'), node(4, 'ap')],
      links: [link(1, 2), link(2, 3), link(3, 4)],
    }

    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(1)?.tier).toBe(ROLE_TIER.firewall)
    expect(byId.get(2)?.tier).toBe(ROLE_TIER.router)
    expect(byId.get(3)?.tier).toBe(ROLE_TIER.core)
    expect(byId.get(4)?.tier).toBe(ROLE_TIER.edge)
    expect(byId.get(1)!.y).toBeLessThan(byId.get(2)!.y)
    expect(byId.get(2)!.y).toBeLessThan(byId.get(3)!.y)
    expect(byId.get(3)!.y).toBeLessThan(byId.get(4)!.y)
  })

  it('实验室场景：汇聚一行、五台接入一行，而不是六台挤在同一行', () => {
    const topology: NetworkTopology = {
      nodes: [
        node(1, 'switch', undefined, '16F汇聚交换机'),
        node(2, 'switch', undefined, '16F接入交换机2'),
        node(3, 'switch', undefined, '16F接入交换机3'),
        node(4, 'switch', undefined, '16F门禁交换机'),
        node(5, 'switch', undefined, '16F商务部交换机'),
        node(6, 'switch', undefined, '16F财务部交换机'),
      ],
      links: [link(1, 2), link(2, 3), link(1, 4), link(1, 5), link(1, 6)],
    }
    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(1)?.tier).toBe(ROLE_TIER.aggregation)
    for (const id of [2, 3, 4, 5, 6]) {
      expect(byId.get(id)?.tier).toBe(ROLE_TIER.access)
      expect(byId.get(id)!.y).toBeGreaterThan(byId.get(1)!.y)
    }
    expect(layout.tiers.map((tier) => tier.label)).toEqual(['汇聚', '接入'])
  })

  it('识别类型优先于档案类型决定层级', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'switch', 'router'), node(2, 'switch')],
      links: [link(1, 2)],
    }
    const layout = layoutTopology(topology)
    expect(layout.nodes.find((n) => n.id === 1)?.tier).toBe(ROLE_TIER.router)
    expect(layout.nodes.find((n) => n.id === 2)?.tier).toBe(ROLE_TIER.access)
  })

  it('没有任何链路的节点落到未连接层，不与有链路的节点混排', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'switch'), node(2, 'switch'), node(3, 'switch')],
      links: [link(1, 2)],
    }
    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(3)?.tier).toBe(ISOLATED_TIER)
    expect(byId.get(3)!.y).toBeGreaterThan(byId.get(1)!.y)
    expect(byId.get(3)!.y).toBeGreaterThan(byId.get(2)!.y)
    expect(layout.tiers.at(-1)?.label).toBe('未连接')
  })

  it('同层按上一层邻居的重心排序以减少交叉', () => {
    // 路由器 R1(1)、R2(2) 在上层；S1(3) 连 R2、S2(4) 连 R1 → S2 应排在 S1 左边
    const topology: NetworkTopology = {
      nodes: [node(1, 'router'), node(2, 'router'), node(3, 'switch'), node(4, 'switch')],
      links: [link(2, 3), link(1, 4)],
    }
    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(1)!.x).toBeLessThan(byId.get(2)!.x)
    expect(byId.get(4)!.x).toBeLessThan(byId.get(3)!.x)
  })

  it('每一层给出分层标签与行 y，行间距等于节点高加层间距', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'firewall'), node(2, 'switch')],
      links: [link(1, 2)],
    }
    const layout = layoutTopology(topology)
    expect(layout.tiers).toHaveLength(2)
    expect(layout.tiers[0].label).toBe('防火墙')
    // 只连了防火墙的交换机是叶子，推断为接入
    expect(layout.tiers[1].label).toBe('接入')
    expect(layout.tiers[1].y - layout.tiers[0].y).toBeGreaterThanOrEqual(GAP_Y)
    expect(layout.nodes.find((n) => n.id === 1)?.y).toBe(layout.tiers[0].y)
  })

  it('画布宽度随最宽一层的节点数增长，高度随层数增长', () => {
    const narrow = layoutTopology({ nodes: [node(1, 'switch')], links: [] })
    const wide = layoutTopology({
      nodes: [node(1, 'switch'), node(2, 'switch'), node(3, 'switch'), node(4, 'switch')],
      links: [],
    })
    const tall = layoutTopology({
      nodes: [node(1, 'firewall'), node(2, 'switch')],
      links: [link(1, 2)],
    })

    expect(wide.width).toBeGreaterThan(narrow.width)
    expect(tall.height).toBeGreaterThan(narrow.height)
  })
})
