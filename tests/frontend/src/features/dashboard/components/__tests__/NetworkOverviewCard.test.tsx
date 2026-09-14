import React from 'react'
import { render, screen } from '@testing-library/react'
import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'
import type { NetworkOverviewItem } from '@/features/dashboard/types'

describe('NetworkOverviewCard', () => {
  it('图例条同时给出状态标签与台数，且不再重复渲染「N 台设备」描述', () => {
    const overview: NetworkOverviewItem[] = [
      {
        title: 'switch',
        description: '8 台设备',
        count: 8,
        iconName: 'Network',
        gradient: 'from-red-500 to-pink-600',
        status: 'critical',
      },
      {
        title: 'ap',
        description: '16 台设备',
        count: 16,
        iconName: 'Wifi',
        gradient: 'from-green-500 to-teal-600',
        status: 'healthy',
      },
    ]

    render(<NetworkOverviewCard overview={overview} topology={{ nodes: [], links: [] }} />)

    const legend = screen.getByRole('list', { name: '网络概览设备类型图例' })
    expect(legend).toHaveTextContent('交换机')
    expect(legend).toHaveTextContent('严重')
    expect(legend).toHaveTextContent('8 台')
    expect(legend).toHaveTextContent('无线 AP')
    expect(legend).toHaveTextContent('健康')
    expect(legend).toHaveTextContent('16 台')
    expect(screen.queryByText('8 台设备')).not.toBeInTheDocument()
  })
})
