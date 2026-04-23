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

jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')

  type SelectContextValue = {
    value?: string
    open: boolean
    setOpen: (open: boolean) => void
    onValueChange?: (value: string) => void
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null)

  const useSelectContext = () => {
    const context = React.useContext(SelectContext)
    if (!context) {
      throw new Error('Select mock context is missing')
    }
    return context
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => {
      const [open, setOpen] = React.useState(false)
      return (
        <SelectContext.Provider value={{ value, open, setOpen, onValueChange }}>
          <div>{children}</div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          {...props}
        >
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = useSelectContext()
      return open ? <div role="listbox">{children}</div> : null
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string
      children: React.ReactNode
    }) => {
      const { value: currentValue, onValueChange, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="option"
          aria-selected={currentValue === value}
          onClick={() => {
            onValueChange?.(value)
            setOpen(false)
          }}
        >
          {children}
        </button>
      )
    },
  }
})

describe('ExecutionFilters 下拉统一化', () => {
  it('应使用统一 Select 实现状态筛选，并保持 onStatusChange 契约', async () => {
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
        onClearAllFilters={jest.fn()}
        onQuickDateFilter={jest.fn()}
        hasDateFilter={false}
        hasAnyFilter={false}
        onRefresh={jest.fn()}
        isFetching={false}
        hasRunningExecutions={false}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '执行状态筛选' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '执行状态筛选' }))
    await user.click(screen.getByRole('option', { name: '失败' }))
    expect(onStatusChange).toHaveBeenCalledWith('failed')
  })

  it('应使用统一紧凑工具栏规格渲染状态筛选与刷新按钮', () => {
    render(
      <ExecutionFilters
        statusFilter="all"
        startDate=""
        endDate=""
        onStatusChange={jest.fn()}
        onStartDateChange={jest.fn()}
        onEndDateChange={jest.fn()}
        onClearDateRange={jest.fn()}
        onClearAllFilters={jest.fn()}
        onQuickDateFilter={jest.fn()}
        hasDateFilter={false}
        hasAnyFilter={false}
        onRefresh={jest.fn()}
        isFetching={false}
        hasRunningExecutions={false}
      />
    )

    const statusSelect = screen.getByRole('combobox', { name: '执行状态筛选' })
    const refreshButton = screen.getByRole('button', { name: '刷新' })

    expect(statusSelect).toHaveClass('h-9')
    expect(statusSelect).toHaveClass('text-sm')
    expect(refreshButton).toHaveClass('h-9')
  })
})
