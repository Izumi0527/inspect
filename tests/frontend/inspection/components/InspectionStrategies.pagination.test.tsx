import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionStrategies } from '@/features/inspection/components/InspectionStrategies'

const mockUseInspectionStrategies = jest.fn()
const mockToggleStrategyMutateAsync = jest.fn()
const mockDeleteStrategyMutateAsync = jest.fn()
const mockTriggerExecutionMutateAsync = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: {
      children: React.ReactNode
      [key: string]: unknown
    }) => <div {...props}>{children}</div>,
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStrategies: (...args: unknown[]) => mockUseInspectionStrategies(...args),
  useToggleStrategy: () => ({
    isPending: false,
    mutateAsync: mockToggleStrategyMutateAsync,
  }),
  useDeleteStrategy: () => ({
    isPending: false,
    mutateAsync: mockDeleteStrategyMutateAsync,
  }),
  useTriggerExecution: () => ({
    isPending: false,
    mutateAsync: mockTriggerExecutionMutateAsync,
  }),
}))

jest.mock('@/features/inspection/components/StrategyModal', () => ({
  StrategyModal: () => null,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  CardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    title,
    type = 'button',
    ...props
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    title?: string
    type?: 'button' | 'submit' | 'reset'
    [key: string]: unknown
  }) => (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      {...props}
    >
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Table: () => <div data-testid="inspection-strategies-table" />,
  Pagination: ({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
  }: {
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange?: (pageSize: number) => void
  }) => (
    <div>
      <div>{`分页 ${currentPage}/${totalPages} 共 ${totalItems} 条 每页 ${pageSize} 条`}</div>
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
        上一页
      </button>
      <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
        下一页
      </button>
      <button type="button" onClick={() => onPageSizeChange?.(50)}>
        每页 50 条
      </button>
    </div>
  ),
  ConfirmModal: () => null,
}))

const buildStrategy = (id: string, name: string) => ({
  id,
  name,
  description: `${name} 描述`,
  type: 'manual' as const,
  devices: [1],
  templates: [101],
  enabled: true,
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-04-01T10:00:00Z',
})

describe('InspectionStrategies 分页能力', () => {
  beforeEach(() => {
    mockUseInspectionStrategies.mockReset()
    mockUseInspectionStrategies.mockReturnValue({
      data: {
        items: [buildStrategy('1', '策略一')],
        total: 45,
        pages: 3,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应向策略列表 hook 传入分页参数，并允许切换页码与每页条数', async () => {
    const user = userEvent.setup()

    render(<InspectionStrategies />)

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
        })
      )
    })

    expect(screen.getByText('分页 1/3 共 45 条 每页 20 条')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 20,
        })
      )
    })

    await user.click(screen.getByRole('button', { name: '每页 50 条' }))

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
        })
      )
    })
  })

  it('首页应禁用上一页，末页应禁用下一页', async () => {
    const user = userEvent.setup()

    render(<InspectionStrategies />)

    const previousButton = screen.getByRole('button', { name: '上一页' })
    const nextButton = screen.getByRole('button', { name: '下一页' })

    expect(previousButton).toBeDisabled()
    expect(nextButton).not.toBeDisabled()

    await user.click(nextButton)
    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      expect(mockUseInspectionStrategies).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 3,
          pageSize: 20,
        })
      )
    })

    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上一页' })).not.toBeDisabled()
  })
})
