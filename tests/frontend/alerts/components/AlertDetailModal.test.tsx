import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AlertDetailModal } from '@/features/alerts/components/AlertDetailModal'
import { fetchAlert, fetchAlertOperations } from '@/features/alerts/api/alerts.api'

jest.mock('@/features/alerts/api/alerts.api', () => ({
  fetchAlert: jest.fn(),
  addAlertComment: jest.fn(),
  fetchAlertOperations: jest.fn(),
}))

jest.mock('framer-motion', () => ({
  motion: {
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: any) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  },
}))

jest.mock('@/components/atoms', () => ({
  SimpleModal: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? <div data-testid="simple-modal">{children}</div> : null),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('AlertDetailModal 深链详情加载', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('仅提供 alertId 且 alert 为空时，应拉取并展示告警详情', async () => {
    ;(fetchAlert as jest.Mock).mockResolvedValue({
      id: '99',
      title: '深链告警',
      description: 'desc',
      device: '设备A',
      severity: 'warning',
      status: 'active',
      timestamp: new Date().toISOString(),
      category: 'other',
      tags: [],
      metadata: {},
    })

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={null}
        // 组件尚未声明该入参时用 any 绕过类型检查，保证先写测试再实现
        {...({ alertId: '99' } as any)}
      />,
    )

    await waitFor(() => {
      expect(fetchAlert).toHaveBeenCalledWith('99')
    })
    expect(await screen.findByText('深链告警')).toBeInTheDocument()
  })

  it('当已提供 alert 时，不应重复拉取详情', async () => {
    ;(fetchAlert as jest.Mock).mockResolvedValue({
      id: '99',
      title: '不应被加载的告警',
      description: 'desc',
      device: '设备A',
      severity: 'warning',
      status: 'active',
      timestamp: new Date().toISOString(),
      category: 'other',
      tags: [],
      metadata: {},
    })

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={{
          id: '1',
          title: '列表内告警',
          description: 'desc',
          device: '设备A',
          severity: 'warning',
          status: 'active',
          timestamp: new Date().toISOString(),
          category: 'other',
          tags: [],
          metadata: {},
        }}
        {...({ alertId: '99' } as any)}
      />,
    )

    expect(await screen.findByText('列表内告警')).toBeInTheDocument()
    expect(fetchAlert).toHaveBeenCalledTimes(0)
  })

  it('切换到时间线标签时，应加载并展示操作历史', async () => {
    ;(fetchAlertOperations as jest.Mock).mockResolvedValue([
      {
        id: 'op-1',
        alertId: '1',
        operationType: 'acknowledge',
        operatorId: 'u1',
        operatorName: '张三',
        operationTime: new Date().toISOString(),
        note: '已确认',
        metadata: {},
      },
    ])

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={{
          id: '1',
          title: '列表内告警',
          description: 'desc',
          device: '设备A',
          severity: 'warning',
          status: 'active',
          timestamp: new Date().toISOString(),
          category: 'other',
          tags: [],
          metadata: {},
        }}
      />,
    )

    fireEvent.click(screen.getByText('时间线'))

    await waitFor(() => {
      expect(fetchAlertOperations).toHaveBeenCalledWith('1', 100)
    })

    expect(await screen.findByText('告警确认')).toBeInTheDocument()
    expect(await screen.findByText(/由 张三 确认/)).toBeInTheDocument()
  })
})
