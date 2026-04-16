import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditLogFilters } from '../AuditLogFilters'

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SmartDateRangePicker: (props: {
    startDate: string
    endDate: string
    onQuickSelect?: (range: 'today' | 'week' | 'month') => void
    onClear?: () => void
  }) => (
    <div>
      <div data-testid="smart-date-range-value">
        {props.startDate}|{props.endDate}
      </div>
      <button type="button" onClick={() => props.onQuickSelect?.('week')}>
        快捷本周
      </button>
      <button type="button" onClick={() => props.onClear?.()}>
        清除日期范围
      </button>
    </div>
  ),
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select
      aria-label="mock-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: React.ReactNode
  }) => <option value={value}>{children}</option>,
}))

describe('AuditLogFilters', () => {
  it('会复用智能日期范围选择器并暴露快捷筛选与清除能力', async () => {
    const user = userEvent.setup()
    const onQuickDateFilter = jest.fn()
    const onClearDateRange = jest.fn()
    const onClearAllFilters = jest.fn()

    render(
      <AuditLogFilters
        actionFilter=""
        statusFilter=""
        startDate="2026-04-12"
        endDate="2026-04-16"
        hasDateFilter={true}
        hasAnyFilter={true}
        onActionChange={jest.fn()}
        onStatusChange={jest.fn()}
        onQuickDateFilter={onQuickDateFilter}
        onClearDateRange={onClearDateRange}
        onClearAllFilters={onClearAllFilters}
      />
    )

    expect(screen.getByTestId('smart-date-range-value')).toHaveTextContent('2026-04-12|2026-04-16')
    expect(screen.getByText('已应用 1 个筛选')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '快捷本周' }))
    expect(onQuickDateFilter).toHaveBeenCalledWith('week')

    await user.click(screen.getByRole('button', { name: '清除日期范围' }))
    expect(onClearDateRange).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /清除筛选/i }))
    expect(onClearAllFilters).toHaveBeenCalledTimes(1)
  })
})
