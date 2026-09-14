import React from 'react'
import { render, screen } from '@testing-library/react'

import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'
import type { NetworkTopology, TopologyNode } from '@/features/dashboard/types'

const node = (id: number, type: string): TopologyNode => ({
  id,
  name: `dev-${id}`,
  ip: `10.0.0.${id}`,
  deviceType: type,
  vendor: '',
  model: '',
  firmwareVersion: '',
  status: 'online',
  unmanagedNeighbors: 0,
})

const topology: NetworkTopology = {
  nodes: [node(1, 'switch'), node(2, 'switch'), node(3, 'firewall')],
  links: [{ id: 'l', source: 1, target: 3, sourcePort: 'G1', targetPort: 'eth1', bidirectional: true }],
}

describe('NetworkOverviewCard', () => {
  it('类型计数保留为图例，且每台设备渲染一个节点而不是每类一张卡', () => {
    render(
      <NetworkOverviewCard
        overview={[
          { title: 'switch', description: '2 台设备', count: 2, iconName: 'Network', gradient: '', status: 'healthy' },
          { title: 'firewall', description: '1 台设备', count: 1, iconName: 'Shield', gradient: '', status: 'critical' },
        ]}
        topology={topology}
      />
    )

    const legend = screen.getByRole('list', { name: '网络概览设备类型图例' })
    expect(legend).toHaveTextContent('交换机')
    expect(legend).toHaveTextContent('2 台')
    expect(legend).toHaveTextContent('防火墙')
    expect(legend).toHaveTextContent('1 台')

    expect(screen.getAllByRole('button', { name: /设备节点/ })).toHaveLength(3)
  })

  it('既无设备也无分组数据时显示空态', () => {
    render(<NetworkOverviewCard overview={[]} topology={{ nodes: [], links: [] }} />)
    expect(screen.getByText('暂无网络概览数据')).toBeInTheDocument()
  })
})
