import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { NetworkTopologyGraph } from '@/features/dashboard/components/topology/NetworkTopologyGraph'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

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

describe('NetworkTopologyGraph', () => {
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

  it('点击节点显示详情：识别类型与档案类型并列、型号版本、链路端口', () => {
    render(<NetworkTopologyGraph topology={threeNodeTopology} />)

    fireEvent.click(screen.getByRole('button', { name: /设备节点 core/ }))

    const detail = screen.getByTestId('topology-node-detail')
    expect(detail).toHaveTextContent('core')
    expect(detail).toHaveTextContent('10.0.0.1')
    expect(detail).toHaveTextContent('SNMP 识别：路由器')
    expect(detail).toHaveTextContent('档案类型：交换机')
    expect(detail).toHaveTextContent('S12700')
    expect(detail).toHaveTextContent('V200R019')
    expect(detail).toHaveTextContent('未纳管邻居 2 个')
    expect(detail).toHaveTextContent('GigabitEthernet0/0/1 ↔ acc-1 GigabitEthernet0/0/24')
    expect(detail).toHaveTextContent('GigabitEthernet0/0/2 ↔ fw eth1')
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
