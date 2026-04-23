import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateFiltersBar } from '@/features/inspection/components/TemplateFiltersBar'

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
      button: createMotionComponent('button'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
  }
})

jest.mock('@/components/atoms', () => ({
  Badge: ({ children, asChild = false }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  SimpleInput: ({
    value,
    onChange,
    placeholder,
    leftIcon,
    rightIcon,
    id,
    className,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    id?: string
    className?: string
  }) => (
    <div>
      {leftIcon}
      <input id={id} value={value} onChange={onChange} placeholder={placeholder} className={className} />
      {rightIcon}
    </div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
    title,
    ...props
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    title?: string
    [key: string]: unknown
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} title={title} {...props}>
      {children}
    </button>
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

describe('TemplateFiltersBar', () => {
  const baseProps = {
    filters: {},
    searchText: '',
    onFilterChange: jest.fn(),
    onSearchChange: jest.fn(),
    onClearAll: jest.fn(),
    onRefresh: jest.fn(),
  }

  it('默认应隐藏厂商设备类型分类等字段标题，仅保留可访问名称', () => {
    render(<TemplateFiltersBar {...baseProps} />)

    expect(screen.queryByText('厂商')).not.toBeInTheDocument()
    expect(screen.queryByText('设备类型')).not.toBeInTheDocument()
    expect(screen.queryByText('分类')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '厂商筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '设备类型筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '分类筛选' })).toBeInTheDocument()
  })

  it('筛选栏应使用紧凑触发器和搜索框样式契约', () => {
    render(<TemplateFiltersBar {...baseProps} filters={{ vendor: 'Cisco' }} />)

    expect(screen.getByRole('textbox', { name: '搜索模板' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '厂商筛选' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '厂商筛选' })).toHaveClass('rounded-lg')
    expect(screen.getByRole('combobox', { name: '厂商筛选' })).toHaveClass('border-primary/50')
  })

  it('有激活筛选时应展示计数与所有激活筛选 chip', () => {
    render(
      <TemplateFiltersBar
        {...baseProps}
        filters={{ vendor: 'Cisco', deviceType: 'router', category: 'network' }}
        searchText="核心设备"
      />
    )

    expect(screen.getByText('已应用 4 个')).toBeInTheDocument()
    expect(screen.getByText('搜索: 核心设备')).toBeInTheDocument()
    expect(screen.getByText('厂商: Cisco')).toBeInTheDocument()
    expect(screen.getByText('设备类型: 路由器')).toBeInTheDocument()
    expect(screen.getByText('分类: 网络')).toBeInTheDocument()
  })

  it('点击单个激活筛选 chip 时应只移除对应筛选', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()

    render(
      <TemplateFiltersBar
        {...baseProps}
        filters={{ vendor: 'Cisco', deviceType: 'router', category: 'network' }}
        searchText="核心设备"
        onFilterChange={onFilterChange}
      />
    )

    await user.click(screen.getByRole('button', { name: '移除 厂商: Cisco 筛选' }))

    expect(onFilterChange).toHaveBeenCalledWith('vendor', '')
  })
})
