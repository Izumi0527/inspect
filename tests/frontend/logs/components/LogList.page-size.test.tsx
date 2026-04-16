import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogList } from '@/features/logs/components/LogList'
import type { DeviceLog } from '@/features/logs/types'

const mockPageSizeSelect = jest.fn()

jest.mock(
  '@/components/atoms/page-size-select',
  () => ({
    PageSizeSelect: (props: {
      value: number
      options?: number[]
      onChange: (value: number) => void
      ariaLabel?: string
    }) => {
      mockPageSizeSelect(props)
      return (
        <button
          type="button"
          data-testid="logs-page-size-select"
          aria-label={props.ariaLabel}
          onClick={() => props.onChange(50)}
        >
          {`页大小:${props.value}`}
        </button>
      )
    },
  }),
  { virtual: true }
)

jest.mock('@/features/logs/components/LogListItem', () => ({
  LogListItem: ({ log }: { log: DeviceLog }) => <div>{`log-${log.id}`}</div>,
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: () => void }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={() => onCheckedChange?.()}
      aria-label="select-all"
    />
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
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
    SelectValue: () => null,
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

const buildLog = (id: number): DeviceLog => ({
  id,
  device_id: 101,
  device_name: `设备-${id}`,
  device_ip: '10.0.0.1',
  level: 'info',
  facility: 'system',
  source: 'syslog',
  message: `message-${id}`,
  log_timestamp: '2026-03-31T10:00:00Z',
  collected_at: '2026-03-31T10:00:00Z',
  created_at: '2026-03-31T10:00:00Z',
})

describe('LogList 每页条数下拉', () => {
  beforeEach(() => {
    mockPageSizeSelect.mockReset()
  })

  it('应使用共享 PageSizeSelect 实现，而不是页面内联下拉', () => {
    render(
      <LogList
        logs={[buildLog(1), buildLog(2)]}
        selectedLogs={[]}
        onSelectLog={jest.fn()}
        onSelectAll={jest.fn()}
        onClearSelection={jest.fn()}
        pagination={{
          current: 1,
          total: 50,
          pageSize: 20,
          onPageChange: jest.fn(),
          onPageSizeChange: jest.fn(),
        }}
      />
    )

    expect(screen.getByTestId('logs-page-size-select')).toBeInTheDocument()
    expect(mockPageSizeSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 20,
        ariaLabel: '每页条数',
      })
    )
  })

  it('应通过共享组件触发页大小切换', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = jest.fn()
    const onPageChange = jest.fn()

    render(
      <LogList
        logs={[buildLog(1), buildLog(2)]}
        selectedLogs={[]}
        onSelectLog={jest.fn()}
        onSelectAll={jest.fn()}
        onClearSelection={jest.fn()}
        pagination={{
          current: 1,
          total: 50,
          pageSize: 20,
          onPageChange,
          onPageSizeChange,
        }}
      />
    )

    await user.click(screen.getByTestId('logs-page-size-select'))
    expect(onPageSizeChange).toHaveBeenCalledTimes(1)
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })

  it('分页按钮行为应保持可用', () => {
    const onPageSizeChange = jest.fn()
    const onPageChange = jest.fn()

    render(
      <LogList
        logs={[buildLog(1), buildLog(2)]}
        selectedLogs={[]}
        onSelectLog={jest.fn()}
        onSelectAll={jest.fn()}
        onClearSelection={jest.fn()}
        pagination={{
          current: 2,
          total: 100,
          pageSize: 20,
          onPageChange,
          onPageSizeChange,
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })
})
