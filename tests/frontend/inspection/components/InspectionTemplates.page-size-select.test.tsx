import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionTemplates } from '@/features/inspection/components/InspectionTemplates'

const mockUseInspectionTemplates = jest.fn()
const mockRefetch = jest.fn()
const mockCloneTemplateMutateAsync = jest.fn()
const mockDeleteTemplateMutateAsync = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: {
      children: React.ReactNode
      [key: string]: unknown
    }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
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
    disabled,
    title,
    type = 'button',
    ...props
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    title?: string
    type?: 'button' | 'submit' | 'reset'
    [key: string]: unknown
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} title={title} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Table: () => <div data-testid="inspection-templates-table" />,
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    className,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    className?: string
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
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

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTemplates: (...args: unknown[]) => mockUseInspectionTemplates(...args),
  useCloneTemplate: () => ({
    isPending: false,
    mutateAsync: mockCloneTemplateMutateAsync,
  }),
  useDeleteTemplate: () => ({
    isPending: false,
    mutateAsync: mockDeleteTemplateMutateAsync,
  }),
}))

jest.mock('@/features/inspection/api/inspection.api', () => ({
  fetchInspectionTemplate: jest.fn(),
}))

jest.mock('@/features/inspection/components/TemplateDetailModal', () => ({
  TemplateDetailModal: () => null,
}))

jest.mock('@/features/inspection/components/TemplateImportModal', () => ({
  TemplateImportModal: () => null,
}))

jest.mock('@/features/inspection/components/CreateTemplateWizard', () => ({
  CreateTemplateWizard: () => null,
}))

jest.mock('@/features/inspection/components/QuickTemplateCreate', () => ({
  QuickTemplateCreate: () => null,
}))

const buildTemplate = (id: string, name: string) => ({
  id,
  name,
  description: `${name} 描述`,
  category: 'network' as const,
  deviceTypes: ['router'],
  checkItems: [],
  isBuiltIn: false,
  isActive: true,
  createdAt: '2026-03-31T10:00:00Z',
  updatedAt: '2026-03-31T10:00:00Z',
})

describe('InspectionTemplates 每页条数下拉统一化', () => {
  beforeEach(() => {
    mockUseInspectionTemplates.mockReset()
    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: [buildTemplate('1', '模板一'), buildTemplate('2', '模板二')],
        total: 100,
      },
      isLoading: false,
      refetch: mockRefetch,
      error: null,
    })
  })

  it('应使用统一 Select 实现，而不是原生 select', () => {
    const { container } = render(<InspectionTemplates />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '每页条数' })).toBeInTheDocument()
  })

  it('切换每页条数时，应以字符串值驱动 Select 并把分页重置到第 1 页', async () => {
    const user = userEvent.setup()

    render(<InspectionTemplates />)

    await user.click(screen.getByRole('button', { name: '2' }))

    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 20,
        })
      )
    })

    await user.click(screen.getByRole('combobox', { name: '每页条数' }))
    expect(screen.getByRole('option', { name: '10 条' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '20 条' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '50 条' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '50 条' }))

    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
        })
      )
    })
  })
})
