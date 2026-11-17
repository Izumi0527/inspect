import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonitoringTimeRangeControl } from '@/features/monitoring/components/shared/MonitoringTimeRangeControl'
import { TIME_RANGE_OPTIONS } from '@/features/monitoring/utils/monitoring'

describe('MonitoringTimeRangeControl（头部时间范围复合浮层）', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 10, 15, 12, 0, 0, 0))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('收起态触发器显示预设中文名或自定义区间，且无采样间隔提示', () => {
    const { rerender } = render(
      <MonitoringTimeRangeControl timeRange="6h" onTimeRangeChange={jest.fn()} />
    )
    const trigger = screen.getByRole('button', { name: '监控时间范围' })
    expect(trigger).toHaveTextContent('近6小时')
    expect(trigger).not.toHaveAttribute('title')
    expect(screen.queryByText(/采样间隔/)).not.toBeInTheDocument()

    rerender(
      <MonitoringTimeRangeControl timeRange="2026-11-09..2026-11-12" onTimeRangeChange={jest.fn()} />
    )
    expect(screen.getByRole('button', { name: '监控时间范围' })).toHaveTextContent('11/09 → 11/12')
  })

  it('展开浮层显示 8 个快捷范围按钮与默认提示，点击快捷项回调并关闭浮层', async () => {
    const onTimeRangeChange = jest.fn()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<MonitoringTimeRangeControl timeRange="6h" onTimeRangeChange={onTimeRangeChange} />)

    await user.click(screen.getByRole('button', { name: '监控时间范围' }))

    const group = screen.getByRole('group', { name: '快捷时间范围' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(TIME_RANGE_OPTIONS.length)
    for (const option of TIME_RANGE_OPTIONS) {
      const btn = within(group).getByRole('button', { name: option.label })
      expect(btn).toHaveAttribute('aria-pressed', option.value === '6h' ? 'true' : 'false')
    }
    expect(screen.getByText('点选开始和结束日期，最长 14 天')).toBeInTheDocument()
    expect(screen.queryByText(/采样间隔/)).not.toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: '近7天' }))
    expect(onTimeRangeChange).toHaveBeenCalledWith('7d')
    expect(screen.queryByRole('group', { name: '快捷时间范围' })).not.toBeInTheDocument()
  })

  it('自定义范围激活态下快捷按钮均未按下，底部展示天数汇总', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(
      <MonitoringTimeRangeControl timeRange="2026-11-09..2026-11-12" onTimeRangeChange={jest.fn()} />
    )

    await user.click(screen.getByRole('button', { name: '监控时间范围' }))

    const group = screen.getByRole('group', { name: '快捷时间范围' })
    for (const btn of within(group).getAllByRole('button')) {
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
    expect(screen.getByText('11月09日 — 11月12日，共 4 天')).toBeInTheDocument()
  })

  it('支持日历两步点选自定义日期范围，并禁用未来日期与超过 14 天的日期', async () => {
    const onTimeRangeChange = jest.fn()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<MonitoringTimeRangeControl timeRange="6h" onTimeRangeChange={onTimeRangeChange} />)

    await user.click(screen.getByRole('button', { name: '监控时间范围' }))

    expect(screen.getByRole('button', { name: '2026-11-16' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一月' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '2026-11-01' }))
    expect(screen.getByText('已选 11月01日，请点选结束日期（最长 14 天）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-11-15' })).toBeDisabled()

    // 切换快捷或重新点选：点击 11/09 会作为第 2 次点选完成 11-01..11-09
    await user.click(screen.getByRole('button', { name: '2026-11-09' }))
    expect(onTimeRangeChange).toHaveBeenCalledWith('2026-11-01..2026-11-09')
    expect(screen.queryByRole('group', { name: '快捷时间范围' })).not.toBeInTheDocument()
  })

  it('反序点选 12 号和 9 号时自动归正为 2026-11-09..2026-11-12', async () => {
    const onTimeRangeChange = jest.fn()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<MonitoringTimeRangeControl timeRange="6h" onTimeRangeChange={onTimeRangeChange} />)

    await user.click(screen.getByRole('button', { name: '监控时间范围' }))
    await user.click(screen.getByRole('button', { name: '2026-11-12' }))
    await user.click(screen.getByRole('button', { name: '2026-11-09' }))

    expect(onTimeRangeChange).toHaveBeenCalledWith('2026-11-09..2026-11-12')
  })
})
