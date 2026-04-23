import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionReports } from '@/features/reports/components/InspectionReports'

const mockUseReports = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useReports: (...args: unknown[]) => mockUseReports(...args),
  useDeleteReport: () => ({
    mutateAsync: jest.fn(),
  }),
  useGenerateInspectionReport: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    title,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    title?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ErrorAlert: ({ message }: { message: string }) => <div>{message}</div>,
  Table: ({
    data,
  }: {
    data: Array<{ id: string; title: string }>
  }) => (
    <div>
      {data.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
  ConfirmModal: () => null,
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

describe('InspectionReports 下拉规范收敛', () => {
  beforeEach(() => {
    mockUseReports.mockReset()
    mockUseReports.mockReturnValue({
      data: {
        reports: [
          {
            id: 'r1',
            title: 'PDF 报告',
            description: 'desc1',
            category: 'daily',
            status: 'completed',
            format: 'pdf',
            generatedBy: 'admin',
            fileSize: 1024,
            createdAt: '2026-03-31T10:00:00Z',
            parameters: {
              dateRange: { startDate: '2026-03-30', endDate: '2026-03-31' },
            },
          },
          {
            id: 'r2',
            title: 'Excel 报告',
            description: 'desc2',
            category: 'weekly',
            status: 'failed',
            format: 'excel',
            generatedBy: 'admin',
            fileSize: 2048,
            createdAt: '2026-03-31T10:00:00Z',
            parameters: {
              dateRange: { startDate: '2026-03-23', endDate: '2026-03-31' },
            },
          },
        ],
        total: 2,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应渲染具备可访问名称的状态/格式下拉', () => {
    render(<InspectionReports searchText="" />)

    expect(screen.getByRole('combobox', { name: '报告状态筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '报告格式筛选' })).toBeInTheDocument()
  })

  it('应渲染审计日志同款的紧凑搜索框与筛选控件', () => {
    render(
      <InspectionReports
        searchText=""
        onSearchTextChange={jest.fn()}
      />
    )

    const searchInput = screen.getByRole('textbox', { name: '搜索巡检报告' })
    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')
    expect(screen.getByRole('combobox', { name: '报告状态筛选' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '报告状态筛选' })).toHaveClass('text-sm')
    expect(screen.getByRole('combobox', { name: '报告格式筛选' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '报告格式筛选' })).toHaveClass('text-sm')
  })

  it('切换状态筛选后，应透传到 useReports 查询参数', async () => {
    const user = userEvent.setup()
    render(<InspectionReports searchText="" />)

    await user.click(screen.getByRole('combobox', { name: '报告状态筛选' }))
    await user.click(screen.getByRole('option', { name: '已完成' }))

    await waitFor(() => {
      expect(mockUseReports).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      )
    })
  })

  it('切换格式筛选后，应影响当前页展示数据', async () => {
    const user = userEvent.setup()
    render(<InspectionReports searchText="" />)

    expect(screen.getByText('PDF 报告')).toBeInTheDocument()
    expect(screen.getByText('Excel 报告')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '报告格式筛选' }))
    await user.click(screen.getByRole('option', { name: 'PDF' }))

    await waitFor(() => {
      expect(screen.getByText('PDF 报告')).toBeInTheDocument()
      expect(screen.queryByText('Excel 报告')).not.toBeInTheDocument()
    })
  })
})
