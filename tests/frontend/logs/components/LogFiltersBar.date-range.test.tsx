import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogFiltersBar } from '@/features/logs/components/LogFiltersBar'
import { formatDateYMD } from '@/utils/formatters'

// 日期筛选与巡检执行页、告警中心共用 SmartDateRangePicker；
// 这里只验证筛选栏把选择结果映射到 startDate / endDate 两个扁平字段。

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))

const baseFilters = {
  searchQuery: '',
  levelFilter: 'all' as const,
  facilityFilter: 'all' as const,
  sourceFilter: 'all' as const,
  includeSelf: false,
}

describe('LogFiltersBar 日期筛选', () => {
  it('应提供占位文案为「日期」的日期范围选择器', () => {
    render(<LogFiltersBar filters={baseFilters} onFilterChange={jest.fn()} />)

    expect(screen.getByRole('button', { name: '日期范围选择器' })).toBeInTheDocument()
    expect(screen.getByText('日期')).toBeInTheDocument()
  })

  it('快捷「今天」应分别写入 startDate 与 endDate', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()
    render(<LogFiltersBar filters={baseFilters} onFilterChange={onFilterChange} />)

    await user.click(screen.getByRole('button', { name: '日期范围选择器' }))
    await user.click(await screen.findByRole('button', { name: '今天' }))

    const today = formatDateYMD(new Date())
    expect(onFilterChange).toHaveBeenCalledWith('startDate', today)
    expect(onFilterChange).toHaveBeenCalledWith('endDate', today)
  })

  it('已选区间时触发按钮显示区间，点击清除应把两个字段清空', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()
    render(
      <LogFiltersBar
        filters={{ ...baseFilters, startDate: '2026-08-20', endDate: '2026-09-19' }}
        onFilterChange={onFilterChange}
      />,
    )

    expect(screen.getByText('08/20')).toBeInTheDocument()
    expect(screen.getByText('09/19')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '清除日期范围' }))

    expect(onFilterChange).toHaveBeenCalledWith('startDate', '')
    expect(onFilterChange).toHaveBeenCalledWith('endDate', '')
  })
})
