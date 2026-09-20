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

describe('ActiveAlertsCard 预览上限', () => {
  const manyAlerts: RecentAlert[] = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    device: `dev-${index + 1}`,
    message: `告警 ${index + 1}`,
    severity: 'medium',
    time: '2026-09-20T01:00:00Z',
  }))

  it('只是快速预览：最多渲染 20 条，底部按钮标出总数并固定在滚动区之外', () => {
    render(<ActiveAlertsCard alerts={manyAlerts} total={25} />)

    const list = screen.getByTestId('active-alerts-list')
    expect(within(list).getAllByTestId('active-alert-item')).toHaveLength(20)
    expect(screen.queryByText('dev-21')).not.toBeInTheDocument()
    expect(list.className).toContain('overflow-y-auto')

    const link = screen.getByRole('link', { name: /查看所有告警/ })
    expect(link).toHaveTextContent('共 25 条')
    expect(list.contains(link)).toBe(false)
  })

  it('标题旁显示活跃告警总数（后端截断后的总数），而不是预览条数', () => {
    render(<ActiveAlertsCard alerts={manyAlerts.slice(0, 20)} total={25} />)
    expect(screen.getByTestId('active-alerts-count')).toHaveTextContent('25')
    expect(screen.getByRole('link', { name: /查看所有告警/ })).toHaveTextContent('共 25 条')
  })

  it('未传总数时以列表长度为准', () => {
    render(<ActiveAlertsCard alerts={manyAlerts.slice(0, 3)} />)
    expect(screen.getByTestId('active-alerts-count')).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: '查看所有告警' })).toBeInTheDocument()
  })
})
