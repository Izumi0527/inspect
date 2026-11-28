import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExecutionFilters } from '@/features/inspection/components/ExecutionFilters'

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    className?: string
  }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SmartDateRangePicker: ({
    onStartDateChange,
    onEndDateChange,
  }: {
    startDate: string
    endDate: string
    onStartDateChange: (date: string) => void
    onEndDateChange: (date: string) => void
    onClear?: () => void
    onQuickSelect?: (range: 'today' | 'week' | 'month') => void
  }) => (
    <div data-testid="smart-date-range-picker">
      <input
        aria-label="开始日期"
        type="date"
        onChange={(e) => onStartDateChange(e.target.value)}
      />
      <input
        aria-label="结束日期"
        type="date"
        onChange={(e) => onEndDateChange(e.target.value)}
      />
    </div>
  ),
}))

describe('ExecutionFilters 状态分段器与工具栏规范', () => {
  it('应渲染内联状态分段器且不含原生 select，点击切换保持 onStatusChange 契约', async () => {
    const user = userEvent.setup()
    const onStatusChange = jest.fn()
    const { container } = render(
      <ExecutionFilters
        statusFilter="all"
        startDate=""
        endDate=""
        onStatusChange={onStatusChange}
        onStartDateChange={jest.fn()}
        onEndDateChange={jest.fn()}
        onClearDateRange={jest.fn()}
        onQuickDateFilter={jest.fn()}
        onRefresh={jest.fn()}
        isFetching={false}
        hasRunningExecutions={false}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const statusGroup = screen.getByRole('group', { name: '执行状态筛选' })
    expect(statusGroup).toBeInTheDocument()
    expect(statusGroup).toHaveClass('h-9')

    const allButton = screen.getByRole('button', { name: '全部' })
    const failedButton = screen.getByRole('button', { name: '失败' })
    expect(allButton).toHaveAttribute('aria-pressed', 'true')
    expect(failedButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(failedButton)
    expect(onStatusChange).toHaveBeenCalledWith('failed')
  })

  it('应使用统一紧凑工具栏规格渲染状态分段器与刷新按钮，不再渲染旧计数或清除按钮', () => {
    render(
      <ExecutionFilters
        statusFilter="completed"
        startDate=""
        endDate=""
        onStatusChange={jest.fn()}
        onStartDateChange={jest.fn()}
        onEndDateChange={jest.fn()}
        onClearDateRange={jest.fn()}
        onQuickDateFilter={jest.fn()}
        onRefresh={jest.fn()}
        isFetching={false}
        hasRunningExecutions={false}
      />
    )

    const statusGroup = screen.getByRole('group', { name: '执行状态筛选' })
    const refreshButton = screen.getByRole('button', { name: '刷新' })
    const completedButton = screen.getByRole('button', { name: '已完成' })

    expect(statusGroup).toHaveClass('h-9')
    expect(completedButton).toHaveClass('h-7')
    expect(completedButton).toHaveAttribute('aria-pressed', 'true')
    expect(refreshButton).toHaveClass('h-9')
    expect(screen.queryByText(/已应用 \d+ 个筛选/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^清除筛选$/ })).not.toBeInTheDocument()
  })
})
