import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionStrategies } from '@/features/inspection/components/InspectionStrategies'

const mockUseInspectionStrategies = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStrategies: (...args: unknown[]) => mockUseInspectionStrategies(...args),
  useToggleStrategy: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useDeleteStrategy: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useTriggerExecution: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/features/inspection/components/StrategyModal', () => ({
  StrategyModal: () => null,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    title?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Table: ({ size }: { size?: 'small' | 'default' | 'large' }) => (
    <div data-testid="inspection-strategies-table" data-size={size ?? 'default'}>
      InspectionStrategiesTable
    </div>
  ),
  Pagination: () => null,
  ConfirmModal: () => null,
}))

jest.mock('@/components/shared', () => ({
  CompactPageToolbar: ({
    search,
    filters,
    secondaryActions,
    primaryActions,
    testIdPrefix,
  }: {
    search?: { value: string; ariaLabel: string }
    filters?: React.ReactNode
    secondaryActions?: Array<{ key: string; label: string }>
    primaryActions?: Array<{ key: string; label: string }>
    testIdPrefix?: string
  }) => (
    <div data-testid={`${testIdPrefix ?? 'toolbar'}-end-group`}>
      {search ? <div>{`search:${search.ariaLabel}:${search.value}`}</div> : null}
      {filters}
      {secondaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
      {primaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
    </div>
  ),
}))

describe('InspectionStrategies 最小筛选能力', () => {
  beforeEach(() => {
    mockUseInspectionStrategies.mockReset()
    mockUseInspectionStrategies.mockReturnValue({
      data: {
        items: [],
        total: 0,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应把类型和启用状态筛选透传给策略 hook', async () => {
    const user = userEvent.setup()

    render(<InspectionStrategies />)

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: undefined,
          enabled: undefined,
        })
      )
    })

    await user.click(screen.getByRole('button', { name: '仅手动' }))

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'manual',
          enabled: undefined,
        })
      )
    })

    await user.click(screen.getByRole('button', { name: '仅启用' }))

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'manual',
          enabled: true,
        })
      )
    })
  })

  it('应将筛选与页面动作统一到紧凑工具栏，并恢复默认表格规格', () => {
    mockUseInspectionStrategies.mockReturnValue({
      data: {
        items: [
          {
            id: 'strategy-1',
            name: '核心策略',
            description: '用于核心设备巡检',
            type: 'scheduled',
            enabled: true,
            cron: '0 0 * * * ?',
            devices: [{ id: 1 }],
            nextRunTime: '2026-04-23T10:00:00Z',
          },
        ],
        total: 1,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<InspectionStrategies />)

    expect(screen.getByTestId('inspection-strategies-toolbar-end-group')).toBeInTheDocument()
    expect(screen.getByText('全部类型')).toBeInTheDocument()
    expect(screen.getByText('全部状态')).toBeInTheDocument()
    expect(screen.getByText('创建策略')).toBeInTheDocument()
    expect(screen.getByTestId('inspection-strategies-table')).toHaveAttribute('data-size', 'default')
  })
})
