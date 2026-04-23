import React from 'react'
import { render, screen } from '@testing-library/react'
import { LogFiltersBar } from '@/features/logs/components/LogFiltersBar'

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
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

describe('LogFiltersBar 下拉统一化', () => {
  it('应使用统一 Select 并为三个筛选下拉提供明确 aria-label', () => {
    const { container } = render(
      <LogFiltersBar
        filters={{
          searchQuery: '',
          levelFilter: 'all',
          facilityFilter: 'all',
          sourceFilter: 'all',
        }}
        onFilterChange={jest.fn()}
        onReset={jest.fn()}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '日志级别筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '设施类型筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '日志来源筛选' })).toBeInTheDocument()
  })

  it('应使用审计日志同款的紧凑搜索框和下拉规格', () => {
    render(
      <LogFiltersBar
        filters={{
          searchQuery: '',
          levelFilter: 'all',
          facilityFilter: 'all',
          sourceFilter: 'all',
        }}
        onFilterChange={jest.fn()}
        onReset={jest.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('搜索日志内容...')
    const levelSelect = screen.getByRole('combobox', { name: '日志级别筛选' })
    const facilitySelect = screen.getByRole('combobox', { name: '设施类型筛选' })
    const sourceSelect = screen.getByRole('combobox', { name: '日志来源筛选' })

    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')
    expect(levelSelect).toHaveClass('h-9')
    expect(levelSelect).toHaveClass('text-sm')
    expect(facilitySelect).toHaveClass('h-9')
    expect(facilitySelect).toHaveClass('text-sm')
    expect(sourceSelect).toHaveClass('h-9')
    expect(sourceSelect).toHaveClass('text-sm')
  })
})
