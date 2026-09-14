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
})
