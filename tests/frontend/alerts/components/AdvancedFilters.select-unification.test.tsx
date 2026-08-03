import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdvancedFilters } from '@/features/alerts/components/AdvancedFilters'

jest.mock('@/components/atoms', () => {
  const React = require('react') as typeof import('react')

  const PopoverContext = React.createContext<{
    open: boolean
    onOpenChange: (open: boolean) => void
  }>({ open: false, onOpenChange: () => {} })

  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,

    // Popover 的轻量替身：只模拟开合行为，不走 Portal。
    // 本用例聚焦 Select 统一化与表单可访问性；浮层的挂载位置
    // 由 AdvancedFilters.popover.test.tsx 用真实组件验证。
    Popover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange: (open: boolean) => void
      children: React.ReactNode
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        <div>{children}</div>
      </PopoverContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: React.ReactElement }) => {
      const { open, onOpenChange } = React.useContext(PopoverContext)
      return React.cloneElement(children, {
        onClick: () => onOpenChange(!open),
        'aria-expanded': open,
      } as React.HTMLAttributes<HTMLElement>)
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  }
})

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

describe('AdvancedFilters 下拉统一化', () => {
  it('展开后应使用统一 Select，并为时间范围下拉提供明确 aria-label', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AdvancedFilters
        onFilterChange={jest.fn()}
        onReset={jest.fn()}
        renderAsCard={false}
      />
    )

    await user.click(screen.getByRole('button', { name: /高级过滤/ }))

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '时间范围' })).toBeInTheDocument()
  })

  it('关键词搜索输入框应绑定显式标签与 name 属性', async () => {
    const user = userEvent.setup()

    render(
      <AdvancedFilters
        onFilterChange={jest.fn()}
        onReset={jest.fn()}
        renderAsCard={false}
      />
    )

    await user.click(screen.getByRole('button', { name: /高级过滤/ }))

    const keywordInput = screen.getByRole('textbox', { name: '关键词搜索' })

    expect(keywordInput).toHaveAttribute('id', 'alert-advanced-search-input')
    expect(keywordInput).toHaveAttribute('name', 'alert-advanced-search')
  })
})
