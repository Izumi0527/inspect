import React from 'react'
import { render, screen } from '@testing-library/react'
import { DateRangePicker } from '@/components/atoms/DateRangePicker'

describe('DateRangePicker', () => {
  it('开始/结束日期输入应提供稳定的 id、name 与标签绑定', () => {
    render(
      <DateRangePicker
        startDate="2026-04-12"
        endDate="2026-04-19"
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    )

    const startLabel = screen.getByText('开始日期').closest('label')
    const endLabel = screen.getByText('结束日期').closest('label')

    expect(startLabel).toHaveAttribute('for', 'date-range-start')
    expect(endLabel).toHaveAttribute('for', 'date-range-end')

    expect(screen.getByLabelText('开始日期')).toHaveAttribute('id', 'date-range-start')
    expect(screen.getByLabelText('开始日期')).toHaveAttribute('name', 'date-range-start')
    expect(screen.getByLabelText('结束日期')).toHaveAttribute('id', 'date-range-end')
    expect(screen.getByLabelText('结束日期')).toHaveAttribute('name', 'date-range-end')
  })
})
