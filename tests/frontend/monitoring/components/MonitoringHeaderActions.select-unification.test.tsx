import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonitoringHeaderActions } from '@/features/monitoring/components/shared/MonitoringHeaderActions'
import type { UseMonitoringPageResult } from '@/features/monitoring/hooks/useMonitoringPage'

jest.mock('@/features/monitoring/components/ReportExportButton', () => ({
  ReportExportButton: () => <div>导出按钮</div>,
}))

jest.mock('@/components/atoms', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
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

const buildPage = (overrides: Partial<UseMonitoringPageResult> = {}): UseMonitoringPageResult => ({
  timeRange: '24h',
  setTimeRange: jest.fn(),
  timeRangeLabel: '近24小时',
  wsHealth: 'connected',
  pageVisible: true,
  canExportReport: false,
  canReadAlerts: true,
  envelope: undefined,
  data: undefined,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  isRefetching: false,
  lastUpdateLabel: '2026-03-31 10:00:00',
  isDataStale: false,
  dataAgeLabel: '1 分钟',
  apiOkButDataStale: false,
  hasEffectivePartialFailure: false,
  effectiveFailedSectionLabels: [],
  realtimeAlertsPermissionLimited: false,
  ...overrides,
})

describe('MonitoringHeaderActions 下拉统一化', () => {
  it('应使用 ui/select 且触发器具备明确 aria-label', () => {
    const { container } = render(<MonitoringHeaderActions page={buildPage()} />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '监控时间范围' })).toBeInTheDocument()
  })

  it('切换时间范围时应保持 setTimeRange 回调契约', async () => {
    const user = userEvent.setup()
    const setTimeRange = jest.fn()
    render(
      <MonitoringHeaderActions
        page={buildPage({ setTimeRange })}
      />
    )

    await user.click(screen.getByRole('combobox', { name: '监控时间范围' }))
    expect(screen.getByRole('option', { name: '近24小时' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '近7天' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '近30天' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: '近7天' }))
    expect(setTimeRange).toHaveBeenCalledWith('7d')
  })
})

