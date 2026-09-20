import { inferNodeRoles, roleFromName } from '@/features/dashboard/utils/topologyRoles'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

const node = (id: number, name: string, type = 'switch', detected?: string): TopologyNode => ({
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

describe('roleFromName', () => {
  it('按中英文关键字识别核心 / 汇聚 / 接入', () => {
    expect(roleFromName('16F核心交换机')).toBe('core')
    expect(roleFromName('CORE-SW-01')).toBe('core')
    expect(roleFromName('16F汇聚交换机')).toBe('aggregation')
    expect(roleFromName('agg-sw-2')).toBe('aggregation')
    expect(roleFromName('DIST-SW')).toBe('aggregation')
    expect(roleFromName('16F接入交换机2')).toBe('access')
    expect(roleFromName('ACC-SW-3')).toBe('access')
    expect(roleFromName('access-16f')).toBe('access')
  })

  it('没有关键字返回 null，不把 "account" 之类误判为接入', () => {
    expect(roleFromName('16F门禁交换机')).toBeNull()
    expect(roleFromName('accounting-sw')).toBeNull()
  })
})

describe('inferNodeRoles', () => {
  it('防火墙与路由器按类型定角色，识别类型优先于档案类型', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'fw', 'firewall'), node(2, 'r1', 'switch', 'router'), node(3, 'ap1', 'ap')],
      links: [],
    }
    const roles = inferNodeRoles(topology)
    expect(roles.get(1)).toEqual({ role: 'firewall', source: 'type' })
    expect(roles.get(2)).toEqual({ role: 'router', source: 'type' })
    expect(roles.get(3)).toEqual({ role: 'edge', source: 'type' })
  })

  it('交换机优先按名称关键字定角色', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, '16F汇聚交换机'), node(2, '16F接入交换机2')],
      links: [link(1, 2)],
    }
    const roles = inferNodeRoles(topology)
    expect(roles.get(1)).toEqual({ role: 'aggregation', source: 'name' })
    expect(roles.get(2)).toEqual({ role: 'access', source: 'name' })
  })

  it('无关键字的叶子交换机推断为接入', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, '16F汇聚交换机'), node(2, '16F门禁交换机'), node(3, '16F财务部交换机')],
      links: [link(1, 2), link(1, 3)],
    }
    const roles = inferNodeRoles(topology)
    expect(roles.get(2)).toEqual({ role: 'access', source: 'inferred' })
    expect(roles.get(3)).toEqual({ role: 'access', source: 'inferred' })
  })

  it('分量内没有核心时，度最大的无关键字交换机推断为核心（双核心并列都算）', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, 'sw-a'), node(2, 'sw-b'), node(3, 'sw-c'), node(4, 'sw-d'), node(5, 'sw-e')],
      // a、b 各连三台，c 连两台，d/e 是叶子
      links: [link(1, 2), link(1, 3), link(1, 4), link(2, 3), link(2, 5)],
    }
    const roles = inferNodeRoles(topology)
    expect(roles.get(1)).toEqual({ role: 'core', source: 'inferred' })
    expect(roles.get(2)).toEqual({ role: 'core', source: 'inferred' })
    expect(roles.get(3)).toEqual({ role: 'aggregation', source: 'inferred' })
    expect(roles.get(4)).toEqual({ role: 'access', source: 'inferred' })
    expect(roles.get(5)).toEqual({ role: 'access', source: 'inferred' })
  })

  it('分量内已有按名称识别的核心时，其余多度交换机推断为汇聚而不是核心', () => {
    const topology: NetworkTopology = {
      nodes: [node(1, '核心交换机'), node(2, 'sw-mid'), node(3, 'sw-leaf-1'), node(4, 'sw-leaf-2')],
      links: [link(1, 2), link(2, 3), link(2, 4)],
    }
    const roles = inferNodeRoles(topology)
    expect(roles.get(1)).toEqual({ role: 'core', source: 'name' })
    expect(roles.get(2)).toEqual({ role: 'aggregation', source: 'inferred' })
  })

  it('没有任何链路的无关键字交换机推断为接入', () => {
    const roles = inferNodeRoles({ nodes: [node(1, 'lonely')], links: [] })
    expect(roles.get(1)).toEqual({ role: 'access', source: 'inferred' })
  })
})
