/**
 * 告警时间范围筛选测试
 *
 * 组件本身是 SmartDateRangePicker 的薄包装，负责三件事：
 * 1. 把选中的日期区间持久化到 localStorage，并在挂载时回放；
 * 2. 把「今天 / 本周 / 本月」快捷键映射为具体日期；
 * 3. 清除时同时清掉缓存并通知父组件。
 * 日历本身的行为由 SmartDateRangePicker 自己负责，这里不重复覆盖。
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AlertTimeRangeFilter,
  ALERT_TIME_RANGE_FILTER_STORAGE_KEY,
} from '@/features/alerts/components/AlertTimeRangeFilter'
import { formatDateYMD } from '@/utils/formatters'

const todayStr = () => formatDateYMD(new Date())

describe('AlertTimeRangeFilter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('应渲染智能日期范围选择器作为入口，且不再有关键词/级别/状态等冗余筛选', () => {
    render(<AlertTimeRangeFilter onFilterChange={jest.fn()} onReset={jest.fn()} />)

    expect(screen.getByRole('button', { name: '日期范围选择器' })).toBeInTheDocument()
    expect(screen.getByText('日期')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('点击快捷「今天」应回调今天的区间并写入本地缓存', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()
    render(<AlertTimeRangeFilter onFilterChange={onFilterChange} onReset={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: '日期范围选择器' }))
    await user.click(await screen.findByRole('button', { name: '今天' }))

    const expected = { dateRange: { start: todayStr(), end: todayStr() } }
    expect(onFilterChange).toHaveBeenLastCalledWith(expected)
    expect(JSON.parse(localStorage.getItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY) ?? 'null')).toEqual(expected)
  })

  it('有选中区间时触发按钮应显示区间，点击清除应清缓存并通知父组件', async () => {
    const user = userEvent.setup()
    const onReset = jest.fn()
    localStorage.setItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY, JSON.stringify({ dateRange: { start: '2026-08-20', end: '2026-09-19' } }))
    render(
      <AlertTimeRangeFilter
        value={{ dateRange: { start: '2026-08-20', end: '2026-09-19' } }}
        onFilterChange={jest.fn()}
        onReset={onReset}
      />,
    )

    expect(screen.getByText('08/20')).toBeInTheDocument()
    expect(screen.getByText('09/19')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '清除日期范围' }))

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY)).toBeNull()
  })

  it('点选日历某天作为开始日期时，不应被同一事件内的 end 回调覆盖', async () => {
    const user = userEvent.setup()
    const onFilterChange = jest.fn()
    render(
      <AlertTimeRangeFilter
        value={{ dateRange: { start: '2026-09-01', end: '2026-09-10' } }}
        onFilterChange={onFilterChange}
        onReset={jest.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '日期范围选择器' }))
    await user.click(await screen.findByRole('button', { name: '2026年9月5日' }))

    // SmartDateRangePicker 先回调 start=09-05，再回调 end=''：最终应保留新的 start
    expect(onFilterChange).toHaveBeenLastCalledWith({ dateRange: { start: '2026-09-05', end: '' } })
  })

  it('挂载时应回放本地缓存中的区间', () => {
    const saved = { dateRange: { start: '2026-09-01', end: '2026-09-10' } }
    localStorage.setItem(ALERT_TIME_RANGE_FILTER_STORAGE_KEY, JSON.stringify(saved))
    const onFilterChange = jest.fn()

    render(<AlertTimeRangeFilter value={{}} onFilterChange={onFilterChange} onReset={jest.fn()} />)

    expect(onFilterChange).toHaveBeenCalledWith(saved)
  })
})
