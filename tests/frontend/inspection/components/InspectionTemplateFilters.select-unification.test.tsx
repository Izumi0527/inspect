import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VendorFilter } from '@/features/inspection/components/VendorFilter'
import { DeviceTypeFilter } from '@/features/inspection/components/DeviceTypeFilter'
import { CategoryFilter } from '@/features/inspection/components/CategoryFilter'

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

describe('巡检模板筛选下拉统一化', () => {
  it('VendorFilter 应使用统一 Select 实现，并在切换时透传厂商值', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = render(<VendorFilter value="" onChange={onChange} />)

    expect(container.querySelector('select')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: '厂商筛选' }))
    expect(screen.getByRole('option', { name: '全部厂商' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Huawei' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'Huawei' }))
    expect(onChange).toHaveBeenCalledWith('Huawei')
  })

  it('DeviceTypeFilter 应使用统一 Select 实现，并在切换时透传设备类型值', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = render(<DeviceTypeFilter value="" onChange={onChange} />)

    expect(container.querySelector('select')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: '设备类型筛选' }))
    expect(screen.getByRole('option', { name: '全部设备类型' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '防火墙' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '防火墙' }))
    expect(onChange).toHaveBeenCalledWith('firewall')
  })

  it('CategoryFilter 应使用统一 Select 实现，并在切换时透传分类值', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = render(<CategoryFilter value="" onChange={onChange} />)

    expect(container.querySelector('select')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: '分类筛选' }))
    expect(screen.getByRole('option', { name: '全部分类' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '安全' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '安全' }))
    expect(onChange).toHaveBeenCalledWith('security')
  })
})
