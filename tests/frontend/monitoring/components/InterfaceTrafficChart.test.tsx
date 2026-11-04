import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import {
  InterfaceTrafficChart,
  TrafficSeriesLegend,
} from '@/features/monitoring/components/charts/InterfaceTrafficChart'
import type { NetworkTrafficDataPoint } from '@/features/monitoring/types'

const points: NetworkTrafficDataPoint[] = [
  { timestamp: '2026-09-10T02:00:00Z', inbound: 2.5, outbound: 0.5 },
  { timestamp: '2026-09-10T02:05:00Z', inbound: 3, outbound: 0.75 },
  { timestamp: '2026-09-10T02:10:00Z', inbound: 1.25, outbound: 0.25 },
]

// jsdom 不实现 SVG 文本测量，@visx/text 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

describe('InterfaceTrafficChart（上行/下行两序列）', () => {
  it('只绘制上行与下行两条序列，不再出现总流量', () => {
    const { container } = render(<InterfaceTrafficChart data={points} timeRange="1h" height={240} />)

    const series = Array.from(container.querySelectorAll('path[data-series]')).map((node) =>
      node.getAttribute('data-series')
    )
    expect(series.sort()).toEqual(['inbound', 'outbound'])
    expect(screen.queryByText(/总流量/)).not.toBeInTheDocument()
  })

  it('Y 轴刻度带自适应带宽单位', () => {
    render(<InterfaceTrafficChart data={points} timeRange="1h" height={240} />)

    expect(screen.getAllByText(/bps$/).length).toBeGreaterThan(0)
  })

  it('无数据时显示空态', () => {
    render(<InterfaceTrafficChart data={[]} timeRange="1h" height={240} />)

    expect(screen.getByText('暂无流量数据')).toBeInTheDocument()
  })
})

describe('TrafficSeriesLegend', () => {
  it('图例列出上行与下行两项，且颜色 = 序列', () => {
    render(<TrafficSeriesLegend />)

    const legend = screen.getByRole('list', { name: '流量序列图例' })
    expect(legend).toHaveTextContent('上行')
    expect(legend).toHaveTextContent('下行')
    expect(legend).not.toHaveTextContent('总流量')
  })
})

// 与系统性能趋势、设备温度监控两张图统一：横竖都是醒目虚线（#bcc6d2 / #4b5563，6,5），
// 且随主题实时更新，不必刷新页面
describe('InterfaceTrafficChart 网格（与性能/温度图统一）', () => {
  const gridLines = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('line[stroke-dasharray]'))

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('横竖网格线都存在，且都是醒目虚线', () => {
    const { container } = render(<InterfaceTrafficChart data={points} timeRange="1h" height={240} />)

    const grids = gridLines(container)
    const horizontal = grids.filter((node) => node.getAttribute('y1') === node.getAttribute('y2'))
    const vertical = grids.filter((node) => node.getAttribute('x1') === node.getAttribute('x2'))
    expect(horizontal.length).toBeGreaterThan(0)
    expect(vertical.length).toBeGreaterThan(0)
    for (const node of grids) {
      expect(node.getAttribute('stroke')).toBe('#bcc6d2')
      expect(node.getAttribute('stroke-dasharray')).toBe('6,5')
    }
  })

  it('运行中切换主题，网格颜色随之更新', async () => {
    const { container } = render(<InterfaceTrafficChart data={points} timeRange="1h" height={240} />)
    expect(gridLines(container)[0].getAttribute('stroke')).toBe('#bcc6d2')

    await act(async () => {
      document.documentElement.classList.add('dark')
    })

    await waitFor(() => {
      for (const node of gridLines(container)) {
        expect(node.getAttribute('stroke')).toBe('#4b5563')
      }
    })
  })

  it('坐标轴线用轴色而非网格色，避免网格加深后坐标轴反而比网格浅', () => {
    const { container } = render(<InterfaceTrafficChart data={points} timeRange="1h" height={240} />)

    const axisLines = Array.from(container.querySelectorAll('.visx-axis-line'))
    expect(axisLines.length).toBe(2)
    for (const node of axisLines) {
      expect(node.getAttribute('stroke')).toBe('#6b7280')
    }
  })
})
