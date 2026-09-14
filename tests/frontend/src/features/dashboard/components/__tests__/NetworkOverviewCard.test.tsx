import React from 'react'
import { render, screen } from '@testing-library/react'
import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'
import type { NetworkOverviewItem } from '@/features/dashboard/types'

describe('NetworkOverviewCard', () => {
  it('为不同状态渲染更有辨识度的状态说明，避免与设备数量重复', () => {
    const overview: NetworkOverviewItem[] = [
      {
        title: '核心交换机',
        description: '8 台设备',
        count: 8,
        iconName: 'Network',
        gradient: 'from-red-500 to-pink-600',
        status: 'critical',
      },
      {
        title: '无线 AP',
        description: '16 台设备',
        count: 16,
        iconName: 'Wifi',
        gradient: 'from-green-500 to-teal-600',
        status: 'healthy',
      },
    ]

    render(<NetworkOverviewCard overview={overview} />)

    expect(screen.getByText('需要立即处理当前链路异常')).toBeInTheDocument()
    expect(screen.getByText('运行稳定，暂无异常波动')).toBeInTheDocument()
  })
})
