import React, { createRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PerformanceSection } from '@/features/monitoring/components/sections/PerformanceSection'
import type { SystemPerformanceDataPoint } from '@/features/monitoring/types'

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// jsdom 不实现 SVG 文本测量，@visx/text 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

// 横轴范围 = 所选时间窗口（终点取当前时间）：把当前时间钉在样本数据之后，样本才落在 1h 窗口内
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-06T12:10:00Z').getTime())
})

afterEach(() => {
  jest.restoreAllMocks()
})

const twoDevices: SystemPerformanceDataPoint[] = [
  {
    timestamp: '2026-09-06T12:00:00Z',
    devices: {
      'SW-01': { cpu: 10, memory: 40 },
      'SW-02': { cpu: 20, memory: 50 },
    },
  },
]

function renderSection(systemPerformance: SystemPerformanceDataPoint[]) {
  return render(
    <PerformanceSection
      sectionRef={createRef<HTMLDivElement>()}
      chartsInView
      sectionSystemPerformance={{ ok: true }}
      sectionTemperature={{ ok: true }}
      systemPerformance={systemPerformance}
      temperatureHistory={[]}
      timeRange="1h"
      onRetry={jest.fn()}
    />
  )
}

/** 图上已绘制的序列（data-series = 设备:指标），按出现顺序去重 */
const drawnSeries = (container: HTMLElement) =>
  Array.from(new Set(Array.from(container.querySelectorAll('[data-series]')).map((node) => node.getAttribute('data-series'))))

describe('PerformanceSection（系统性能趋势卡片）', () => {
  it('指标图例位于「系统性能趋势」标题同一行（卡片头部右侧），且不含「网络」', async () => {
    renderSection(twoDevices)
    await screen.findByLabelText('系统性能趋势图')

    const legend = screen.getByRole('group', { name: '指标显隐' })
    expect(legend.parentElement).toHaveTextContent('系统性能趋势')
    expect(within(legend).getByRole('button', { name: 'CPU' })).toBeInTheDocument()
    expect(within(legend).getByRole('button', { name: '内存' })).toBeInTheDocument()
    expect(screen.queryByText('网络')).not.toBeInTheDocument()
  })

  it('点击「内存」后图表只保留各设备的 CPU 线，再点一次恢复', async () => {
    const { container } = renderSection(twoDevices)
    await screen.findByLabelText('系统性能趋势图')
    expect(drawnSeries(container)).toEqual(['SW-01:cpu', 'SW-01:memory', 'SW-02:cpu', 'SW-02:memory'])

    await userEvent.click(screen.getByRole('button', { name: '内存' }))
    expect(drawnSeries(container)).toEqual(['SW-01:cpu', 'SW-02:cpu'])
    expect(screen.getByRole('button', { name: '内存' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: '内存' }))
    expect(drawnSeries(container)).toEqual(['SW-01:cpu', 'SW-01:memory', 'SW-02:cpu', 'SW-02:memory'])
  })

  it('无性能数据时显示空态且不渲染指标图例', () => {
    renderSection([])

    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '指标显隐' })).not.toBeInTheDocument()
  })
})
