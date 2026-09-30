import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionTemplates } from '@/features/inspection/components/InspectionTemplates'

const mockPagination = jest.fn()
const mockUseInspectionTemplates = jest.fn()
const mockUseInspectionTemplateStats = jest.fn()
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
  Pagination: (props: {
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange: (pageSize: number) => void
    showJumpToPage?: boolean
  }) => {
    mockPagination(props)
    return (
      <div data-testid="inspection-templates-pagination">
        <div>{`分页 ${props.currentPage}/${props.totalPages} 共 ${props.totalItems} 条 每页 ${props.pageSize} 条`}</div>
        <button type="button" onClick={() => props.onPageChange(props.currentPage + 1)}>
          下一页
        </button>
        <button
          type="button"
          data-testid="inspection-templates-page-size-select"
          aria-label="每页条数"
          onClick={() => props.onPageSizeChange(50)}
        >
          {`页大小:${props.pageSize}`}
        </button>
        {props.showJumpToPage ? <span data-testid="jump-to-page" /> : null}
      </div>
    )
  },
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
  useInspectionTemplateStats: (...args: unknown[]) => mockUseInspectionTemplateStats(...args),
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

const buildTemplate = (
  id: string,
  name: string,
  overrides?: Partial<{
    isBuiltIn: boolean
    isActive: boolean
  }>
) => ({
  id,
  name,
  description: `${name} 描述`,
  category: 'network' as const,
  deviceTypes: ['router'],
  checkItems: [],
  isBuiltIn: overrides?.isBuiltIn ?? false,
  isActive: overrides?.isActive ?? true,
  createdAt: '2026-03-31T10:00:00Z',
  updatedAt: '2026-03-31T10:00:00Z',
})

describe('InspectionTemplates 每页条数下拉统一化', () => {
  beforeEach(() => {
    mockPagination.mockReset()
    mockUseInspectionTemplates.mockReset()
    mockUseInspectionTemplateStats.mockReset()
    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: [buildTemplate('1', '模板一'), buildTemplate('2', '模板二')],
        total: 100,
      },
      isLoading: false,
      refetch: mockRefetch,
      error: null,
    })
    mockUseInspectionTemplateStats.mockReturnValue({
      data: {
        builtInTotal: 0,
        customTotal: 2,
        activeTotal: 2,
      },
      isLoading: false,
      error: null,
    })
  })

  it('应通过共享 Pagination 渲染页大小下拉（不再自研分页条）', () => {
    render(<InspectionTemplates />)

    expect(screen.getByTestId('inspection-templates-page-size-select')).toBeInTheDocument()
    expect(screen.queryByTestId('jump-to-page')).not.toBeInTheDocument()
    expect(mockPagination).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentPage: 1,
        totalItems: 100,
        pageSize: 10,
      })
    )
  })

  it('切换每页条数时，应通过共享组件回传数字并把分页重置到第 1 页', async () => {
    const user = userEvent.setup()

    render(<InspectionTemplates />)

    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
        })
      )
    })

    await user.click(screen.getByTestId('inspection-templates-page-size-select'))

    await waitFor(() => {
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
        })
      )
    })
  })

  it('分页后统计卡片应基于当前筛选结果全集，而不是当前页数据', () => {
    const pagedTemplates = Array.from({ length: 10 }, (_, index) =>
      buildTemplate(String(index + 1), `模板${index + 1}`, {
        isBuiltIn: true,
        isActive: true,
      })
    )

    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: pagedTemplates,
        total: 19,
      },
      isLoading: false,
      refetch: mockRefetch,
      error: null,
    })
    mockUseInspectionTemplateStats.mockReturnValue({
      data: {
        builtInTotal: 12,
        customTotal: 7,
        activeTotal: 15,
      },
      isLoading: false,
      error: null,
    })

    render(<InspectionTemplates />)

    expect(screen.getByText('全部模板')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByText('内置模板')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('自定义模板')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(mockUseInspectionTemplateStats).toHaveBeenCalled()
  })

  describe('搜索防抖与翻页竞争', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      cleanup()
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })

    it.each([false, true])('初始空搜索不能覆盖快速翻页（StrictMode=%s）', (strictMode) => {
      render(strictMode ? <React.StrictMode><InspectionTemplates /></React.StrictMode> : <InspectionTemplates />)

      fireEvent.click(screen.getByRole('button', { name: '下一页' }))
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 10, search: undefined })
      )

      act(() => { jest.advanceTimersByTime(350) })

      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 10, search: undefined })
      )
      expect(mockPagination).toHaveBeenLastCalledWith(expect.objectContaining({ currentPage: 2 }))
    })

    it('实际搜索及清空搜索应在防抖结束时更新查询并回第一页', () => {
      render(<InspectionTemplates />)
      act(() => { jest.advanceTimersByTime(350) })
      fireEvent.click(screen.getByRole('button', { name: '下一页' }))
      const input = screen.getByRole('textbox', { name: '搜索模板' })
      fireEvent.change(input, { target: { value: '核心' } })

      act(() => { jest.advanceTimersByTime(349) })
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, search: undefined })
      )
      act(() => { jest.advanceTimersByTime(1) })
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: '核心' })
      )
      expect(mockUseInspectionTemplates).not.toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, search: '核心' })
      )

      fireEvent.click(screen.getByRole('button', { name: '下一页' }))
      fireEvent.change(input, { target: { value: '' } })
      act(() => { jest.advanceTimersByTime(349) })
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, search: '核心' })
      )
      act(() => { jest.advanceTimersByTime(1) })
      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: undefined })
      )
    })

    it('输入后在防抖期内撤回到原搜索值，不应重置页码', () => {
      render(<InspectionTemplates />)
      act(() => { jest.advanceTimersByTime(350) })
      fireEvent.click(screen.getByRole('button', { name: '下一页' }))
      const input = screen.getByRole('textbox', { name: '搜索模板' })
      fireEvent.change(input, { target: { value: '临时搜索' } })
      act(() => { jest.advanceTimersByTime(100) })
      fireEvent.change(input, { target: { value: '' } })
      act(() => { jest.advanceTimersByTime(350) })

      expect(mockUseInspectionTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, search: undefined })
      )
    })
  })

})
