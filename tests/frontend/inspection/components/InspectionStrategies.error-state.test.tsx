import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionStrategies } from '@/features/inspection/components/InspectionStrategies'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStrategies: jest.fn(),
  useToggleStrategy: jest.fn(),
  useDeleteStrategy: jest.fn(),
  useTriggerExecution: jest.fn(),
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
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Table: () => <div>Table</div>,
}))

describe('InspectionStrategies 错误态', () => {
  it('列表加载失败时应展示错误态并允许重试', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn()

    ;(inspectionHooks.useInspectionStrategies as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('策略加载失败'),
      refetch,
    })
    ;(inspectionHooks.useToggleStrategy as jest.Mock).mockReturnValue({})
    ;(inspectionHooks.useDeleteStrategy as jest.Mock).mockReturnValue({})
    ;(inspectionHooks.useTriggerExecution as jest.Mock).mockReturnValue({})

    render(<InspectionStrategies />)

    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.getByText('策略加载失败')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
