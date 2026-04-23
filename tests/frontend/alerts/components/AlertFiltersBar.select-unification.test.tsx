import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertFiltersBar } from '@/features/alerts/components/AlertFiltersBar'
import type { AlertFilters } from '@/features/alerts/types'

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
    className,
    ...props
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    className?: string
    [key: string]: unknown
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      {...props}
    />
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

const buildFilters = (overrides: Partial<AlertFilters> = {}): AlertFilters => ({
  searchQuery: '',
  severityFilter: 'all',
  statusFilter: 'all',
  ...overrides,
})

describe('AlertFiltersBar 下拉统一化', () => {
  it('应在非 Card 模式下使用统一 Select 实现，而不是原生 select', () => {
    const { container } = render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={jest.fn()}
        selectedCount={0}
        renderAsCard={false}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '严重级别筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '状态筛选' })).toBeInTheDocument()
  })

  it('切换严重级别和状态时应透传 onFilterChange', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()

    render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={onFilterChange}
        selectedCount={0}
      />
    )

    await user.click(screen.getByRole('combobox', { name: '严重级别筛选' }))
    await user.click(screen.getByRole('option', { name: '严重' }))

    await user.click(screen.getByRole('combobox', { name: '状态筛选' }))
    await user.click(screen.getByRole('option', { name: '已确认' }))

    expect(onFilterChange).toHaveBeenCalledWith('severityFilter', 'critical')
    expect(onFilterChange).toHaveBeenCalledWith('statusFilter', 'acknowledged')
  })

  it('selectedCount 大于 0 时应保留批量操作区域', () => {
    render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={jest.fn()}
        selectedCount={2}
        onBulkAction={jest.fn()}
      />
    )

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量确认' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量解决' })).toBeInTheDocument()
  })

  it('搜索输入框应提供 name 与可访问标签，便于浏览器识别', () => {
    render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={jest.fn()}
        selectedCount={0}
        renderAsCard={false}
      />
    )

    const searchInput = screen.getByRole('textbox', { name: '搜索告警' })

    expect(searchInput).toHaveAttribute('id', 'alert-search-input')
    expect(searchInput).toHaveAttribute('name', 'alert-search')
  })

  it('非 Card 模式下应收敛到紧凑工具栏规格', () => {
    render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={jest.fn()}
        selectedCount={0}
        renderAsCard={false}
      />
    )

    const searchInput = screen.getByRole('textbox', { name: '搜索告警' })
    const severitySelect = screen.getByRole('combobox', { name: '严重级别筛选' })
    const statusSelect = screen.getByRole('combobox', { name: '状态筛选' })

    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')
    expect(severitySelect).toHaveClass('h-9')
    expect(severitySelect).toHaveClass('text-sm')
    expect(statusSelect).toHaveClass('h-9')
    expect(statusSelect).toHaveClass('text-sm')
  })

  it('默认筛选项文案应显示为级别和状态', async () => {
    const user = userEvent.setup()

    render(
      <AlertFiltersBar
        filters={buildFilters()}
        onFilterChange={jest.fn()}
        selectedCount={0}
        renderAsCard={false}
      />
    )

    await user.click(screen.getByRole('combobox', { name: '严重级别筛选' }))
    expect(screen.getByRole('option', { name: '级别' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '所有严重级别' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '状态筛选' }))
    expect(screen.getByRole('option', { name: '状态' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '所有状态' })).not.toBeInTheDocument()
  })
})
