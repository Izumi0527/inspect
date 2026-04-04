import React from 'react'
import { render, screen } from '@testing-library/react'

import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'

describe('NetworkOverviewCard', () => {
  it('应展示后端返回的网络分组状态，而不是只保留样式信息', () => {
    render(
      <NetworkOverviewCard
        overview={[
          {
            title: '核心交换机',
            description: '8 台设备',
            count: 8,
            iconName: 'Network',
            gradient: 'from-red-500 to-pink-600',
            status: 'critical',
          },
        ]}
      />
    )

    expect(screen.getByText('严重')).toBeInTheDocument()
    expect(screen.getByText('核心交换机')).toBeInTheDocument()
  })
})
