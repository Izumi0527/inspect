import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { SystemPerformanceChart } from '@/features/monitoring/components/charts/SystemPerformanceChart'
import type { SystemPerformanceDataPoint } from '@/features/monitoring/types'

// 只 mock 图表原子：把每条线的 名称|颜色|线型 打印出来，断言"设备 × 指标"的编码方式
jest.mock('@/components/atoms/charts', () => ({
  LineChartComponent: ({
    lines,
  }: {
    lines: Array<{ key: string; name?: string; color?: string; strokeDasharray?: string }>
  }) => (
    <ul data-testid="chart-lines">
      {lines.map((line) => (
        <li key={line.key}>{`${line.name}|${line.color}|${line.strokeDasharray ?? 'solid'}`}</li>
      ))}
    </ul>
  ),
}))

const chartLineTexts = () =>
  within(screen.getByTestId('chart-lines'))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

const twoDevices: SystemPerformanceDataPoint[] = [
  {
    timestamp: '2026-09-06T12:00:00Z',
    devices: {
      'SW-01': { cpu: 10, memory: 40 },
      'SW-02': { cpu: 20, memory: 50 },
    },
  },
  {
    timestamp: '2026-09-06T12:05:00Z',
    devices: {
      'SW-01': { cpu: 12, memory: 41 },
      'SW-02': { cpu: 22, memory: 52 },
    },
  },
]

describe('SystemPerformanceChart（按设备区分）', () => {
  it('每台设备生成 CPU 实线与内存虚线，同一设备两条线同色，不同设备颜色不同', () => {
    render(<SystemPerformanceChart data={twoDevices} timeRange="1h" />)

    expect(chartLineTexts()).toEqual([
      'SW-01 CPU|#0891B2|solid',
      'SW-01 内存|#0891B2|6 4',
      'SW-02 CPU|#0EA5E9|solid',
      'SW-02 内存|#0EA5E9|6 4',
    ])
  })

  it('hiddenMetrics 含 memory 时只剩 CPU 线', () => {
    render(
      <SystemPerformanceChart data={twoDevices} timeRange="1h" hiddenMetrics={new Set(['memory'])} />
    )

    expect(chartLineTexts()).toEqual(['SW-01 CPU|#0891B2|solid', 'SW-02 CPU|#0EA5E9|solid'])
  })

  it('底部设备图例列出设备名，且不再出现「网络」', () => {
    render(<SystemPerformanceChart data={twoDevices} timeRange="1h" />)

    const legend = screen.getByRole('list', { name: '设备图例' })
    expect(legend).toHaveTextContent('SW-01')
    expect(legend).toHaveTextContent('SW-02')
    expect(screen.queryByText('网络')).not.toBeInTheDocument()
  })

  it('两个指标都隐藏时显示提示而不是空图', () => {
    render(
      <SystemPerformanceChart
        data={twoDevices}
        timeRange="1h"
        hiddenMetrics={new Set(['cpu', 'memory'])}
      />
    )

    expect(screen.getByText('已隐藏全部指标')).toBeInTheDocument()
    expect(screen.queryByTestId('chart-lines')).not.toBeInTheDocument()
  })

  it('超过 5 台设备时只绘制前 5 台并提示上限', () => {
    const devices: SystemPerformanceDataPoint['devices'] = {}
    for (let i = 1; i <= 6; i += 1) {
      devices[`DEV-${i}`] = { cpu: i, memory: i * 10 }
    }
    render(
      <SystemPerformanceChart
        data={[{ timestamp: '2026-09-06T12:00:00Z', devices }]}
        timeRange="1h"
      />
    )

    const lineTexts = chartLineTexts()
    expect(lineTexts).toHaveLength(10)
    expect(lineTexts.some((text) => text?.startsWith('DEV-6 '))).toBe(false)
    expect(screen.getByText('(最多显示5个设备)')).toBeInTheDocument()
  })

  it('无数据时显示暂无性能数据', () => {
    render(<SystemPerformanceChart data={[]} timeRange="1h" />)
    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()
  })
})
