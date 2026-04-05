import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  Table: ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>
    columns: Array<{
      key: string
      render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode
    }>
  }) => (
    <div>
      {data.map((record) => (
        <div key={String(record.id)}>
          {columns.map((column) => (
            <div key={column.key}>
              {column.render ? column.render(record[column.key], record) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  Pagination: () => null,
  ConfirmModal: ({
    isOpen,
    title,
    description,
    onClose,
    onConfirm,
    confirmText = '确认',
    cancelText = '取消',
  }: {
    isOpen: boolean
    title: string
    description?: string
    onClose: () => void
    onConfirm: () => void
    confirmText?: string
    cancelText?: string
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {description ? <p>{description}</p> : null}
        <button type="button" onClick={onClose}>
          {cancelText}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    ) : null,
}))

const buildStrategy = (id: string, name: string) => ({
  id,
  name,
  description: `${name} 描述`,
  type: 'manual' as const,
  devices: [1, 2],
  templates: [101],
  enabled: true,
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-04-01T10:00:00Z',
})

describe('InspectionStrategies 删除确认', () => {
  beforeEach(() => {
    mockUseInspectionStrategies.mockReset()
    mockDeleteStrategyMutateAsync.mockReset()
    mockDeleteStrategyMutateAsync.mockResolvedValue(undefined)

    mockUseInspectionStrategies.mockReturnValue({
      data: {
        items: [buildStrategy('1', '核心策略')],
        total: 1,
        pages: 1,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('点击删除时应先二次确认，只有确认后才真正发起删除请求', async () => {
    const user = userEvent.setup()

    render(<InspectionStrategies />)

    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(mockDeleteStrategyMutateAsync).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '确认删除策略' })
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText('确定要删除巡检策略“核心策略”吗？删除后将无法恢复。')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(mockDeleteStrategyMutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '确认删除策略' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mockDeleteStrategyMutateAsync).toHaveBeenCalledWith('1')
    })
  })
})
