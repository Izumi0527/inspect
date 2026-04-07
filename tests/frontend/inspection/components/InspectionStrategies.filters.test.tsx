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
  Table: () => <div>InspectionStrategiesTable</div>,
  Pagination: () => null,
  ConfirmModal: () => null,
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
})
