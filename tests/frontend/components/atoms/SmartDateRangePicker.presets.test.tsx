import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SmartDateRangePicker } from '@/components/atoms/SmartDateRangePicker'
import { getQuickDateRange } from '@/utils/quickDateRanges'

// 快捷按钮的选中态：与父级应用的口径来自同一个共享实现，
// 所以「今天/本周/本月」亮起时，页面数据区间必然就是该口径。

const renderPicker = (startDate: string, endDate: string) => {
  const onQuickSelect = jest.fn()
  render(
    <SmartDateRangePicker
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={jest.fn()}
      onEndDateChange={jest.fn()}
      onClear={jest.fn()}
      onQuickSelect={onQuickSelect}
      placeholder="日期"
    />
  )
  return onQuickSelect
}

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '日期范围选择器' }))
  return screen.getByRole('dialog', { name: '日期范围选择面板' })
}

describe('SmartDateRangePicker 快捷区间选中态', () => {
  it('区间恰为「今天」时只有今天按钮选中', async () => {
    const user = userEvent.setup()
    const today = getQuickDateRange('today')
    renderPicker(today.startDate, today.endDate)

    await openPanel(user)

    expect(screen.getByRole('button', { name: '今天' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '本周' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '本月' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('区间恰为「本周」时只有本周按钮选中（取周三，避免与「今天」重合）', async () => {
    // 周一当天「今天」与「本周」是同一个区间，选中态由先匹配的「今天」胜出（见下一条用例），
    // 因此这里把系统时间固定到周三，让两个口径可区分。
    jest.useFakeTimers({ now: new Date(2026, 9, 14, 10, 0, 0) })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const week = getQuickDateRange('week')
    expect(week).toEqual({ startDate: '2026-10-12', endDate: '2026-10-14' })
    renderPicker(week.startDate, week.endDate)

    await openPanel(user)

    expect(screen.getByRole('button', { name: '本周' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '今天' })).toHaveAttribute('aria-pressed', 'false')
    jest.useRealTimers()
  })

  it('周一当天「今天」与「本周」区间相同，由先匹配的「今天」点亮', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0, 0) })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const today = getQuickDateRange('today')
    expect(getQuickDateRange('week')).toEqual(today)

    renderPicker(today.startDate, today.endDate)
    await openPanel(user)

    expect(screen.getByRole('button', { name: '今天' })).toHaveAttribute('aria-pressed', 'true')
    jest.useRealTimers()
  })

  it('区间恰为「本月」时只有本月按钮选中', async () => {
    const user = userEvent.setup()
    const month = getQuickDateRange('month')
    renderPicker(month.startDate, month.endDate)

    await openPanel(user)

    expect(screen.getByRole('button', { name: '本月' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '本周' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('日历以周一为首列：星期标题为 一~日，月初按周一对齐留空', async () => {
    const user = userEvent.setup()
    // 2026-10-01 是周四；周一为首列时，1 号前面应留 3 个空位（一/二/三），落在第 4 列
    renderPicker('2026-10-01', '2026-10-31')
    const panel = await openPanel(user)

    const grids = panel.querySelectorAll('.grid.grid-cols-7')
    const weekdayRow = grids[0]
    expect(Array.from(weekdayRow.children).map((cell) => cell.textContent)).toEqual([
      '一', '二', '三', '四', '五', '六', '日',
    ])

    const dayRow = grids[1]
    expect(dayRow.children[0].textContent).toBe('')
    const dayOne = screen.getByRole('button', { name: '2026年10月1日' })
    expect(dayRow.children[3].contains(dayOne)).toBe(true)
  })

  it('自定义区间不点亮任何快捷按钮', async () => {
    const user = userEvent.setup()
    renderPicker('2026-03-03', '2026-03-09')

    await openPanel(user)

    for (const label of ['今天', '本周', '本月']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('空区间不点亮任何快捷按钮', async () => {
    const user = userEvent.setup()
    renderPicker('', '')

    await openPanel(user)

    for (const label of ['今天', '本周', '本月']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('点击快捷按钮回调对应的 key', async () => {
    const user = userEvent.setup()
    renderPicker('', '')
    const onQuickSelect = jest.fn()
    // 重新渲染以捕获本次回调
    render(
      <SmartDateRangePicker
        startDate=""
        endDate=""
        onStartDateChange={jest.fn()}
        onEndDateChange={jest.fn()}
        onClear={jest.fn()}
        onQuickSelect={onQuickSelect}
        placeholder="日期"
      />
    )

    const triggers = screen.getAllByRole('button', { name: '日期范围选择器' })
    await user.click(triggers[triggers.length - 1])
    const panels = screen.getAllByRole('dialog', { name: '日期范围选择面板' })
    const panel = panels[panels.length - 1]

    const buttons = Array.from(panel.querySelectorAll('button'))
    const weekButton = buttons.find((b) => b.textContent?.trim() === '本周')
    expect(weekButton).toBeTruthy()
    await user.click(weekButton as HTMLElement)

    expect(onQuickSelect).toHaveBeenCalledWith('week')
  })
})
