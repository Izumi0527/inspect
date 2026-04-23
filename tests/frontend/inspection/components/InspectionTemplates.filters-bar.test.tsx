import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionTemplates } from '@/features/inspection/components/InspectionTemplates'

const mockUseInspectionTemplates = jest.fn()
const mockUseInspectionTemplateStats = jest.fn()
const mockRefetch = jest.fn()
const mockCloneTemplateMutateAsync = jest.fn()
const mockDeleteTemplateMutateAsync = jest.fn()

jest.mock('framer-motion', () => {
  const React = require('react') as typeof import('react')

  const createMotionComponent = (tag: keyof JSX.IntrinsicElements) =>
    React.forwardRef<HTMLElement, { children?: React.ReactNode; [key: string]: unknown }>(
      ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
    )

  return {
    motion: {
      div: createMotionComponent('div'),
      ul: createMotionComponent('ul'),
      li: createMotionComponent('li'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

jest.mock('@/components/atoms', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
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
  PageSizeSelect: ({
    value,
    ariaLabel,
  }: {
    value: number
    ariaLabel?: string
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {`页大小:${value}`}
    </button>
  ),
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    className,
    leftIcon,
    rightIcon,
    id,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    className?: string
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    id?: string
  }) => (
    <div>
      {leftIcon}
      <input id={id} value={value} onChange={onChange} placeholder={placeholder} className={className} />
      {rightIcon}
    </div>
  ),
}))

jest.mock('@/components/shared', () => ({
  CompactPageToolbar: ({
    search,
    filters,
    secondaryActions,
    primaryActions,
    testIdPrefix,
  }: {
    search?: {
      ariaLabel: string
      value: string
      onChange?: (value: string) => void
      placeholder?: string
    }
    filters?: React.ReactNode
    secondaryActions?: Array<{ key: string; label: string; onClick?: () => void }>
    primaryActions?: Array<{ key: string; label: string; onClick?: () => void }>
    testIdPrefix?: string
  }) => (
    <div data-testid={`${testIdPrefix ?? 'toolbar'}-end-group`}>
      {search ? (
        <input
          aria-label={search.ariaLabel}
          value={search.value}
          placeholder={search.placeholder}
          onChange={(event) => search.onChange?.(event.target.value)}
        />
      ) : null}
      {filters}
      {secondaryActions?.map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
      {primaryActions?.map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
  CompactStatCard: ({
    title,
    value,
  }: {
    title: string
    value: React.ReactNode
  }) => <div>{`${title}:${value}`}</div>,
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

describe('InspectionTemplates 筛选栏重塑', () => {
  beforeEach(() => {
    mockUseInspectionTemplates.mockReset()
    mockUseInspectionTemplateStats.mockReset()
    mockRefetch.mockReset()
    mockUseInspectionTemplates.mockReturnValue({
      data: {
        templates: [buildTemplate('1', '模板一'), buildTemplate('2', '模板二')],
        total: 2,
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

  it('初始渲染时应直接展示扁平筛选栏，而不是折叠式筛选按钮', () => {
    render(<InspectionTemplates />)

    expect(screen.getByRole('combobox', { name: '厂商筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '设备类型筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '分类筛选' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '筛选' })).not.toBeInTheDocument()
  })

  it('有激活筛选时应在筛选栏中展示清除筛选与刷新按钮', async () => {
    const user = userEvent.setup()

    render(<InspectionTemplates />)

    await user.type(screen.getByRole('textbox', { name: '搜索模板' }), '核心')

    expect(screen.getByRole('button', { name: '清除筛选' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
  })

  it('应将筛选、动作和统计卡片统一到共享页面规格', () => {
    render(<InspectionTemplates />)

    expect(screen.getByTestId('inspection-templates-toolbar-end-group')).toBeInTheDocument()
    expect(screen.getByText('全部模板:2')).toBeInTheDocument()
    expect(screen.getByText('内置模板:0')).toBeInTheDocument()
    expect(screen.getByText('自定义模板:2')).toBeInTheDocument()
    expect(screen.getByText('已启用:2')).toBeInTheDocument()
    expect(screen.getByText('导入模板')).toBeInTheDocument()
    expect(screen.getByText('快速创建')).toBeInTheDocument()
    expect(screen.getByText('创建模板')).toBeInTheDocument()
  })
})
