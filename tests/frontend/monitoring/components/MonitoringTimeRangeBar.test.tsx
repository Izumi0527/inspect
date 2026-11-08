import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonitoringTimeRangeBar } from '@/features/monitoring/components/shared/MonitoringTimeRangeBar'
import { TIME_RANGE_OPTIONS } from '@/features/monitoring/utils/monitoring'

jest.mock('@/components/ui/select', () => require('./helpers/selectMock').createSelectMock())

describe('MonitoringTimeRangeBar（快捷时间键 + 时间范围下拉）', () => {
  it('快捷时间键覆盖全部 8 个档位', () => {
    render(<MonitoringTimeRangeBar timeRange="1h" onTimeRangeChange={jest.fn()} />)

    const group = screen.getByRole('group', { name: '快捷时间范围' })
    expect(group.querySelectorAll('button')).toHaveLength(TIME_RANGE_OPTIONS.length)

    for (const option of TIME_RANGE_OPTIONS) {
      expect(screen.getByRole('button', { name: option.label })).toBeInTheDocument()
    }
  })

  it('当前档位在快捷键上以 aria-pressed 标记，且只有它被按下', () => {
    render(<MonitoringTimeRangeBar timeRange="7d" onTimeRangeChange={jest.fn()} />)

    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveTextContent('近7天')
  })

  it('点击快捷时间键回调对应档位值', async () => {
    const onTimeRangeChange = jest.fn()
    const user = userEvent.setup()
    render(<MonitoringTimeRangeBar timeRange="1h" onTimeRangeChange={onTimeRangeChange} />)

    await user.click(screen.getByRole('button', { name: '近14天' }))

    expect(onTimeRangeChange).toHaveBeenCalledWith('14d')
  })

  it('下拉列出全部 8 档，选择后回调对应档位值', async () => {
    const onTimeRangeChange = jest.fn()
    const user = userEvent.setup()
    render(<MonitoringTimeRangeBar timeRange="1h" onTimeRangeChange={onTimeRangeChange} />)

    await user.click(screen.getByRole('combobox', { name: '监控时间范围' }))
    expect(screen.getAllByRole('option')).toHaveLength(TIME_RANGE_OPTIONS.length)

    await user.click(screen.getByRole('option', { name: '近6小时' }))
    expect(onTimeRangeChange).toHaveBeenCalledWith('6h')
  })

  it('提示采样间隔为 5 分钟', () => {
    render(<MonitoringTimeRangeBar timeRange="3d" onTimeRangeChange={jest.fn()} />)

    expect(screen.getByText('采样间隔 5 分钟')).toBeInTheDocument()
  })
})
