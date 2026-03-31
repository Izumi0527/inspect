import React from 'react'
import { render, screen } from '@testing-library/react'
import { AlertCenter } from '@/components/pages/AlertCenter'
import { MonitoringDashboard } from '@/components/pages/MonitoringDashboard'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
  },
}))

jest.mock('@/components/shared', () => ({
  CompactStatCard: ({
    title,
    value,
  }: {
    title: React.ReactNode
    value: React.ReactNode
  }) => (
    <div>
      {title}:{value}
    </div>
  ),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    className,
    title,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
    title?: string
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={title}
    >
      {children}
    </button>
  ),
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  Table: () => <div>table</div>,
  Input: ({
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
  Modal: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open?: boolean
  }) => (open ? <div>{children}</div> : null),
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TextArea: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
    placeholder?: string
  }) => <textarea value={value} onChange={onChange} placeholder={placeholder} />,
  LineChartComponent: () => <div>line-chart</div>,
  AreaChartComponent: () => <div>area-chart</div>,
  PieChartComponent: () => <div>pie-chart</div>,
  CircularProgress: () => <div>circular-progress</div>,
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

describe('非 features 页面下拉统一化', () => {
  it('AlertCenter 应使用统一 Select 并补齐筛选 aria-label', () => {
    const { container } = render(<AlertCenter />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '告警状态筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '告警严重级别筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '告警类别筛选' })).toBeInTheDocument()
  })

  it('MonitoringDashboard 应使用统一 Select 并补齐时间范围 aria-label', () => {
    const { container } = render(<MonitoringDashboard />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '监控时间范围' })).toBeInTheDocument()
  })
})
