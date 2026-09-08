import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PerformanceMetricLegend } from '@/features/monitoring/components/charts/PerformanceMetricLegend'

describe('PerformanceMetricLegend（CPU/内存 显隐切换）', () => {
  it('渲染 CPU 与 内存 两个切换按钮，aria-pressed 反映当前是否可见', () => {
    render(<PerformanceMetricLegend hiddenMetrics={new Set(['memory'])} onToggle={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'CPU' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '内存' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: '网络' })).not.toBeInTheDocument()
  })

  it('点击某个指标时回调该指标键', async () => {
    const onToggle = jest.fn()
    render(<PerformanceMetricLegend hiddenMetrics={new Set()} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('button', { name: '内存' }))
    expect(onToggle).toHaveBeenCalledWith('memory')

    await userEvent.click(screen.getByRole('button', { name: 'CPU' }))
    expect(onToggle).toHaveBeenCalledWith('cpu')
  })
})
