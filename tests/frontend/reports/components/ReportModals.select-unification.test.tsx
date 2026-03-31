import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionReportModal } from '@/features/reports/components/InspectionReportModal'
import { ReportExportModal } from '@/features/reports/components/ReportExportModal'
import { ReportEditModal } from '@/features/reports/components/ReportEditModal'

const mockGenerateInspectionReport = jest.fn()
const mockUpdateReport = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode
      whileHover?: unknown
      whileTap?: unknown
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }) => <div {...props}>{children}</div>,
  },
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useGenerateInspectionReport: () => ({
    mutateAsync: mockGenerateInspectionReport,
    isPending: false,
  }),
  useUpdateReport: () => ({
    mutateAsync: mockUpdateReport,
    isPending: false,
  }),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/components/atoms', () => ({
  Modal: ({
    open = true,
    children,
  }: {
    open?: boolean
    children: React.ReactNode
  }) => (open ? <div>{children}</div> : null),
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
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
    type,
    disabled,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    type?: string
    disabled?: boolean
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
    />
  ),
  Input: ({
    value,
    onChange,
    placeholder,
    type,
    disabled,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    type?: string
    disabled?: boolean
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
    />
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Loading: () => <div>loading</div>,
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

describe('Report 弹窗下拉统一化', () => {
  it('InspectionReportModal 报告类别下拉应使用 ui/select 并具备 aria-label', () => {
    const { container } = render(
      <InspectionReportModal onClose={jest.fn()} onSuccess={jest.fn()} />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '报告类别' })).toBeInTheDocument()
  })

  it('ReportEditModal 报表类别下拉应使用 ui/select 并具备 aria-label', () => {
    const { container } = render(
      <ReportEditModal
        report={{
          id: 1,
          title: '测试报表',
          description: 'desc',
          category: 'custom',
        } as any}
        onClose={jest.fn()}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '报表类别' })).toBeInTheDocument()
  })

  it('ReportExportModal 导出格式下拉应使用 ui/select 并具备 aria-label', async () => {
    const user = userEvent.setup()
    const { container } = render(<ReportExportModal isOpen onClose={jest.fn()} />)

    await user.click(screen.getByText('设备汇总报表'))

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '导出格式' })).toBeInTheDocument()
  })
})
