import {
  ISOLATED_TIER,
  layoutTopology,
  tierOf,
} from '@/features/dashboard/utils/topologyLayout'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

const node = (id: number, type: string, detected?: string): TopologyNode => ({
  id,
  name: `n${id}`,
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
  it('tierOf 按角色分层：防火墙最上、路由器、交换机、其余在下', () => {
    expect(tierOf('firewall')).toBe(0)
    expect(tierOf('router')).toBe(1)
    expect(tierOf('switch')).toBe(2)
    expect(tierOf('ap')).toBe(3)
    expect(tierOf('server')).toBe(3)
    expect(tierOf('')).toBe(3)
  })

  it('串联的四类设备落在四个递增的层，y 随层递增', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'firewall'), node(2, 'router'), node(3, 'switch'), node(4, 'ap')],
      links: [link(1, 2), link(2, 3), link(3, 4)],
    }

    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(1)?.tier).toBe(0)
    expect(byId.get(2)?.tier).toBe(1)
    expect(byId.get(3)?.tier).toBe(2)
    expect(byId.get(4)?.tier).toBe(3)
    expect(byId.get(1)!.y).toBeLessThan(byId.get(2)!.y)
    expect(byId.get(2)!.y).toBeLessThan(byId.get(3)!.y)
    expect(byId.get(3)!.y).toBeLessThan(byId.get(4)!.y)
  })

  it('识别类型优先于档案类型决定层级', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'switch', 'router'), node(2, 'switch')],
      links: [link(1, 2)],
    }
    const layout = layoutTopology(topology)
    expect(layout.nodes.find((n) => n.id === 1)?.tier).toBe(1)
    expect(layout.nodes.find((n) => n.id === 2)?.tier).toBe(2)
  })

  it('没有任何链路的节点落到孤立层，不与有链路的节点混排', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'switch'), node(2, 'switch'), node(3, 'switch')],
      links: [link(1, 2)],
    }
    const layout = layoutTopology(topology)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))

    expect(byId.get(1)?.tier).toBe(2)
    expect(byId.get(2)?.tier).toBe(2)
    expect(byId.get(3)?.tier).toBe(ISOLATED_TIER)
    expect(byId.get(3)!.y).toBeGreaterThan(byId.get(1)!.y)
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
