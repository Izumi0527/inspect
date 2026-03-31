import React from 'react'
import { render, screen } from '@testing-library/react'
import { TemplateModal } from '@/features/inspection/components/TemplateModal'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useCreateTemplate: jest.fn(),
  useUpdateTemplate: jest.fn(),
}))

jest.mock('@/features/inspection/utils/check-item-support', () => ({
  isCheckItemTypeSupported: () => true,
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    className,
    maxLength,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    className?: string
    maxLength?: number
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      maxLength={maxLength}
    />
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
      disabled,
    }: {
      value: string
      children: React.ReactNode
      disabled?: boolean
    }) => {
      const { value: currentValue, onValueChange, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="option"
          aria-selected={currentValue === value}
          disabled={disabled}
          onClick={() => {
            if (disabled) return
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

describe('TemplateModal 下拉统一化', () => {
  beforeEach(() => {
    ;(inspectionHooks.useCreateTemplate as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })

    ;(inspectionHooks.useUpdateTemplate as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
  })

  it('应使用统一 Select 实现模板类别与检查项类型下拉', () => {
    const template = {
      id: 'template-1',
      name: '模板A',
      description: '描述',
      category: 'custom',
      deviceTypes: ['router'],
      checkItems: [
        {
          id: 'item-1',
          name: '检查项1',
          type: 'snmp',
          config: {},
          weight: 1,
        },
      ],
    } as any

    const { container } = render(
      <TemplateModal template={template} onClose={jest.fn()} onSuccess={jest.fn()} />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '模板类别' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '检查项类型' })).toBeInTheDocument()
  })
})

