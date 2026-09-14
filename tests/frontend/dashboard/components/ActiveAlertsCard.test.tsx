import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { ActiveAlertsCard } from '@/features/dashboard/components/ActiveAlertsCard'
import type { RecentAlert } from '@/features/dashboard/types'

describe('ActiveAlertsCard', () => {
  it('标题为「实时告警」并渲染活跃告警', () => {
    render(
      <ActiveAlertsCard
        alerts={[{ id: 1, device: 'core-sw', message: 'CPU 过高', severity: 'high', time: '2026-09-14T01:00:00Z' }]}
      />
    )

    expect(screen.getByText('实时告警')).toBeInTheDocument()
    expect(screen.getByText('core-sw')).toBeInTheDocument()
    expect(screen.getByText('CPU 过高')).toBeInTheDocument()
    expect(screen.queryByText('最近告警')).not.toBeInTheDocument()
  })

  it('没有活跃告警时只显示空态，不残留任何告警条目或跳转按钮', () => {
    render(<ActiveAlertsCard alerts={[]} />)

    expect(screen.getByText('当前无活跃告警')).toBeInTheDocument()
    expect(screen.queryByText('查看所有告警')).not.toBeInTheDocument()
  })

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

    render(<ActiveAlertsCard alerts={alerts} />)

    const link = screen.getByRole('link', { name: '查看所有告警' })
    expect(link).toHaveAttribute('href', '/alerts')
    expect(within(link).queryByRole('button')).not.toBeInTheDocument()
  })
})
