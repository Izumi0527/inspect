import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'
import { RecentAlertsCard } from '@/features/dashboard/components/RecentAlertsCard'
import type { NetworkOverviewItem, RecentAlert } from '@/features/dashboard/types'

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

describe('RecentAlertsCard', () => {
  it('将“查看所有告警”渲染为单一链接语义，避免嵌套交互元素', () => {
    const alerts: RecentAlert[] = [
      {
        id: 1,
        device: 'core-sw-01',
        message: '核心交换机温度过高',
        severity: 'high',
        time: '2026-04-27T08:00:00.000Z',
        category: 'temperature',
      },
    ]

    render(<RecentAlertsCard alerts={alerts} />)

    const link = screen.getByRole('link', { name: '查看所有告警' })
    expect(link).toHaveAttribute('href', '/alerts')
    expect(within(link).queryByRole('button')).not.toBeInTheDocument()
  })
})
