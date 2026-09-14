import type { NetworkTopology } from '../types'

// 分层拓扑布局：按设备角色自上而下排布（边界 → 汇聚/路由 → 交换 → 终端接入），
// 没有任何链路的设备单独放在最下一层，避免与有连线的设备混排造成误读。
// 确定性算法、无外部依赖，jsdom 中可直接测试。

export const TIER_FIREWALL = 0
export const TIER_ROUTER = 1
export const TIER_SWITCH = 2
export const TIER_EDGE = 3
export const ISOLATED_TIER = 4

export const NODE_W = 96
export const NODE_H = 96
export const GAP_X = 48
export const GAP_Y = 96
export const PADDING_X = 24
export const PADDING_Y = 24

export interface LayoutNode {
  id: number
  tier: number
  x: number
  y: number
}

export interface TopologyLayout {
  nodes: LayoutNode[]
  width: number
  height: number
}

export function tierOf(type: string): number {
  switch (type.trim().toLowerCase()) {
    case 'firewall':
      return TIER_FIREWALL
    case 'router':
      return TIER_ROUTER
    case 'switch':
      return TIER_SWITCH
    default:
      return TIER_EDGE
  }
}

export function layoutTopology(topology: NetworkTopology): TopologyLayout {
  const degree = new Map<number, number>()
  const adjacency = new Map<number, number[]>()
  for (const link of topology.links) {
    if (link.source === link.target) continue
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
    adjacency.set(link.source, [...(adjacency.get(link.source) ?? []), link.target])
    adjacency.set(link.target, [...(adjacency.get(link.target) ?? []), link.source])
  }

  const tiers = new Map<number, number[]>()
  for (const node of topology.nodes) {
    const tier = (degree.get(node.id) ?? 0) === 0
      ? ISOLATED_TIER
      : tierOf(node.detectedType ?? node.deviceType)
    tiers.set(tier, [...(tiers.get(tier) ?? []), node.id])
  }

  const orderedTiers = [...tiers.keys()].sort((a, b) => a - b)
  const maxPerTier = Math.max(1, ...orderedTiers.map((tier) => tiers.get(tier)!.length))
  const width = PADDING_X * 2 + maxPerTier * NODE_W + (maxPerTier - 1) * GAP_X
  const height = PADDING_Y * 2 + orderedTiers.length * NODE_H + Math.max(0, orderedTiers.length - 1) * GAP_Y

  const positions = new Map<number, LayoutNode>()
  orderedTiers.forEach((tier, row) => {
    const ids = [...tiers.get(tier)!]
    // 重心排序：按已放置的上层邻居平均 x 排序；没有上层邻居的按 id 稳定排列
    const barycenter = (id: number): number | null => {
      const placed = (adjacency.get(id) ?? [])
        .map((peer) => positions.get(peer))
        .filter((peer): peer is LayoutNode => peer !== undefined)
      if (placed.length === 0) return null
      return placed.reduce((sum, peer) => sum + peer.x, 0) / placed.length
    }
    ids.sort((a, b) => {
      const ba = barycenter(a)
      const bb = barycenter(b)
      if (ba !== null && bb !== null && ba !== bb) return ba - bb
      if (ba !== null && bb === null) return -1
      if (ba === null && bb !== null) return 1
      return a - b
    })

    const rowWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X
    const startX = (width - rowWidth) / 2
    const y = PADDING_Y + row * (NODE_H + GAP_Y)
    ids.forEach((id, index) => {
      positions.set(id, { id, tier, x: startX + index * (NODE_W + GAP_X), y })
    })
  })

  return {
    nodes: topology.nodes.map((node) => positions.get(node.id)!),
    width,
    height,
  }
}
