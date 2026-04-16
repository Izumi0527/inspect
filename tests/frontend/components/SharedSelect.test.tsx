import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharedSelect } from '@/components/atoms/shared-select'

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

describe('SharedSelect', () => {
  it('应使用统一 Select 包装通用选项，并回传字符串值', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()

    const { container } = render(
      <SharedSelect
        value="week"
        ariaLabel="巡检分析时间周期"
        placeholder="时间周期"
        options={[
          { value: 'day', label: '按天' },
          { value: 'week', label: '按周' },
          { value: 'month', label: '按月' },
        ]}
        onChange={onChange}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '巡检分析时间周期' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '巡检分析时间周期' }))

    expect(screen.getByRole('option', { name: '按天' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '按周' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '按月' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '按月' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('month')
  })
})
