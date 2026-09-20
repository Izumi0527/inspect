import type { NetworkTopology } from '../types'
import { inferNodeRoles, ROLE_LABELS, type NetworkRole } from './topologyRoles'

// 分层拓扑布局：按网络角色自上而下排布（防火墙 → 路由 → 核心 → 汇聚 → 接入 → 终端），
// 没有任何链路的设备单独放在最下一层，避免与有连线的设备混排造成误读。
// 确定性算法、无外部依赖，jsdom 中可直接测试。

export const ROLE_TIER: Record<NetworkRole, number> = {
  firewall: 0,
  router: 1,
  core: 2,
  aggregation: 3,
  access: 4,
  edge: 5,
}
export const ISOLATED_TIER = 6

export const TIER_LABELS: Record<number, string> = {
  [ROLE_TIER.firewall]: ROLE_LABELS.firewall,
  [ROLE_TIER.router]: ROLE_LABELS.router,
  [ROLE_TIER.core]: ROLE_LABELS.core,
  [ROLE_TIER.aggregation]: ROLE_LABELS.aggregation,
  [ROLE_TIER.access]: ROLE_LABELS.access,
  [ROLE_TIER.edge]: ROLE_LABELS.edge,
  [ISOLATED_TIER]: '未连接',
}

export const NODE_W = 96
export const NODE_H = 96
// 同层相邻节点之间要放得下两端的接口标签，间距比节点略宽
export const GAP_X = 72
export const GAP_Y = 112
export const PADDING_X = 24
export const PADDING_Y = 24

export interface LayoutNode {
  id: number
  tier: number
  x: number
  y: number
}

export interface TierBand {
  tier: number
  label: string
  // 该层节点行的顶边 y
  y: number
}

export interface TopologyLayout {
  nodes: LayoutNode[]
  tiers: TierBand[]
  width: number
  height: number
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

  const roles = inferNodeRoles(topology)
  const tiers = new Map<number, number[]>()
  for (const node of topology.nodes) {
    const tier = (degree.get(node.id) ?? 0) === 0
      ? ISOLATED_TIER
      : ROLE_TIER[roles.get(node.id)?.role ?? 'edge']
    tiers.set(tier, [...(tiers.get(tier) ?? []), node.id])
  }

  const orderedTiers = [...tiers.keys()].sort((a, b) => a - b)
  const maxPerTier = Math.max(1, ...orderedTiers.map((tier) => tiers.get(tier)!.length))
  const width = PADDING_X * 2 + maxPerTier * NODE_W + (maxPerTier - 1) * GAP_X
  const height = PADDING_Y * 2 + orderedTiers.length * NODE_H + Math.max(0, orderedTiers.length - 1) * GAP_Y

  const positions = new Map<number, LayoutNode>()
  const bands: TierBand[] = []
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
    bands.push({ tier, label: TIER_LABELS[tier], y })
    ids.forEach((id, index) => {
      positions.set(id, { id, tier, x: startX + index * (NODE_W + GAP_X), y })
    })
  })

  return {
    nodes: topology.nodes.map((node) => positions.get(node.id)!),
    tiers: bands,
    width,
    height,
  }
}
