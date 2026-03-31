import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from '@/components/atoms/pagination'

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
    SelectValue: () => null,
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

describe('Pagination 下拉统一化', () => {
  it('应使用统一 Select 实现，而不是原生 select', () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={5}
        totalItems={100}
        pageSize={10}
        onPageChange={jest.fn()}
        onPageSizeChange={jest.fn()}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '每页条数' })).toBeInTheDocument()
  })

  it('切换每页条数时应保持字符串入参并在组件内转换为数字回调', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = jest.fn()

    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        totalItems={100}
        pageSize={10}
        onPageChange={jest.fn()}
        onPageSizeChange={onPageSizeChange}
      />
    )

    await user.click(screen.getByRole('combobox', { name: '每页条数' }))
    expect(screen.getByRole('option', { name: '10条/页' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '20条/页' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '50条/页' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '100条/页' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '20条/页' }))

    expect(onPageSizeChange).toHaveBeenCalledTimes(1)
    expect(onPageSizeChange).toHaveBeenCalledWith(20)
  })
})
