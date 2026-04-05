import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyModal } from '@/features/inspection/components/StrategyModal'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import * as deviceHooks from '@/features/devices/hooks/useDevices'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useCreateStrategy: jest.fn(),
  useUpdateStrategy: jest.fn(),
  useInspectionTemplates: jest.fn(),
}))

jest.mock('@/features/devices/hooks/useDevices', () => ({
  useDevices: jest.fn(),
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
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
          type='button'
          role='combobox'
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
      return open ? <div role='listbox'>{children}</div> : null
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
          type='button'
          role='option'
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

describe('InspectionStrategies 单模板契约', () => {
  beforeEach(() => {
    ;(inspectionHooks.useCreateStrategy as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })

    ;(inspectionHooks.useUpdateStrategy as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })

    ;(inspectionHooks.useInspectionTemplates as jest.Mock).mockReturnValue({
      data: {
        templates: [
          { id: '1', name: '模板A', isBuiltIn: false },
          { id: '2', name: '模板B', isBuiltIn: false },
        ],
      },
      isLoading: false,
    })

    ;(deviceHooks.useDevices as jest.Mock).mockReturnValue({
      devices: [{ id: 1, name: '设备A', ip: '10.0.0.1' }],
      loading: false,
      loadDevices: jest.fn(),
    })
  })

  it('应只允许选择一个巡检模板，后选中的模板会替换前一个', async () => {
    const user = userEvent.setup()

    render(<StrategyModal strategy={null} onClose={jest.fn()} onSuccess={jest.fn()} />)

    const templateARadio = screen.getByRole('radio', { name: '模板A' })
    const templateBRadio = screen.getByRole('radio', { name: '模板B' })

    await user.click(templateARadio)
    expect(templateARadio).toBeChecked()
    expect(templateBRadio).not.toBeChecked()

    await user.click(templateBRadio)

    expect(templateARadio).not.toBeChecked()
    expect(templateBRadio).toBeChecked()
  })
})
