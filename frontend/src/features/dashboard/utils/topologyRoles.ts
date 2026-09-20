import type { NetworkTopology, TopologyNode } from '../types'

// 拓扑层级角色：防火墙/路由按设备类型定，交换机按名称关键字或链路结构推断，其余设备归为终端。
// 角色只影响展示层的分层与标签，不进入后端契约。

export type NetworkRole = 'firewall' | 'router' | 'core' | 'aggregation' | 'access' | 'edge'

// type：由设备类型直接决定；name：设备名含关键字；inferred：按链路结构推断
export type RoleSource = 'type' | 'name' | 'inferred'

export interface NodeRole {
  role: NetworkRole
  source: RoleSource
}

export const ROLE_LABELS: Record<NetworkRole, string> = {
  firewall: '防火墙',
  router: '路由',
  core: '核心',
  aggregation: '汇聚',
  access: '接入',
  edge: '终端',
}

export const ROLE_SOURCE_LABELS: Record<RoleSource, string> = {
  type: '按设备类型',
  name: '按名称识别',
  inferred: '按拓扑推断',
}

// 关键字按「核心 → 汇聚 → 接入」顺序匹配；英文缩写要求词边界，避免 accounting 被当成 acc
const NAME_RULES: Array<{ role: NetworkRole; pattern: RegExp }> = [
  { role: 'core', pattern: /核心|\bcore\b/i },
  { role: 'aggregation', pattern: /汇聚|\b(?:aggregation|agg|distribution|dist)\b/i },
  { role: 'access', pattern: /接入|\b(?:access|acc)\b/i },
]

export const roleFromName = (name: string): NetworkRole | null => {
  const matched = NAME_RULES.find((rule) => rule.pattern.test(name))
  return matched ? matched.role : null
}

const displayTypeOf = (node: TopologyNode) => (node.detectedType ?? node.deviceType).trim().toLowerCase()

const roleFromType = (type: string): NetworkRole | null => {
  switch (type) {
    case 'firewall':
      return 'firewall'
    case 'router':
      return 'router'
    case 'switch':
      return null
    default:
      return 'edge'
  }
}

// 相邻表：只统计不同设备之间的链路，重复链路只算一个邻居
const buildAdjacency = (topology: NetworkTopology) => {
  const adjacency = new Map<number, Set<number>>()
  for (const node of topology.nodes) adjacency.set(node.id, new Set())
  for (const link of topology.links) {
    if (link.source === link.target) continue
    adjacency.get(link.source)?.add(link.target)
    adjacency.get(link.target)?.add(link.source)
  }
  return adjacency
}

// 连通分量：返回节点 id → 分量编号
const componentsOf = (adjacency: Map<number, Set<number>>) => {
  const component = new Map<number, number>()
  let next = 0
  for (const start of adjacency.keys()) {
    if (component.has(start)) continue
    const stack = [start]
    component.set(start, next)
    while (stack.length > 0) {
      const current = stack.pop()!
      for (const peer of adjacency.get(current) ?? []) {
        if (!component.has(peer)) {
          component.set(peer, next)
          stack.push(peer)
        }
      }
    }
    next += 1
  }
  return component
}

// 交换机角色推断：
//   1. 名称关键字优先；
//   2. 无关键字：度 ≤ 1 的叶子是接入；
//   3. 其余多度交换机：所在分量没有核心时，度最大者是核心（并列都算，覆盖双核心堆叠），
//      否则是汇聚。
export const inferNodeRoles = (topology: NetworkTopology): Map<number, NodeRole> => {
  const roles = new Map<number, NodeRole>()
  const adjacency = buildAdjacency(topology)
  const component = componentsOf(adjacency)
  const pending: TopologyNode[] = []

  for (const node of topology.nodes) {
    const byType = roleFromType(displayTypeOf(node))
    if (byType) {
      roles.set(node.id, { role: byType, source: 'type' })
      continue
    }
    const byName = roleFromName(node.name)
    if (byName) {
      roles.set(node.id, { role: byName, source: 'name' })
      continue
    }
    pending.push(node)
  }

  const coreComponents = new Set<number>()
  for (const [id, role] of roles) {
    if (role.role === 'core') coreComponents.add(component.get(id)!)
  }

  const maxDegreeByComponent = new Map<number, number>()
  for (const node of pending) {
    const degree = adjacency.get(node.id)?.size ?? 0
    const key = component.get(node.id)!
    maxDegreeByComponent.set(key, Math.max(maxDegreeByComponent.get(key) ?? 0, degree))
  }

  for (const node of pending) {
    const degree = adjacency.get(node.id)?.size ?? 0
    const key = component.get(node.id)!
    if (degree <= 1) {
      roles.set(node.id, { role: 'access', source: 'inferred' })
    } else if (!coreComponents.has(key) && degree === maxDegreeByComponent.get(key)) {
      roles.set(node.id, { role: 'core', source: 'inferred' })
    } else {
      roles.set(node.id, { role: 'aggregation', source: 'inferred' })
    }
  }

  return roles
}
