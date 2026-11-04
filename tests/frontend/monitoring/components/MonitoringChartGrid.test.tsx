import React from 'react'
import { render } from '@testing-library/react'
import { SystemPerformanceChart } from '@/features/monitoring/components/charts/SystemPerformanceChart'
import { TemperatureChart } from '@/features/monitoring/components/charts/TemperatureChart'
import type {
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
} from '@/features/monitoring/types'

// jsdom 不实现 SVG 文本测量，@visx/axis 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

/** 采样间隔 3 分钟：数据点落在 3 分钟网格上 */
const timestamps = Array.from({ length: 11 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 4, 2, 0) + i * 3 * 60_000).toISOString()
)

const systemPerformance: SystemPerformanceDataPoint[] = timestamps.map((timestamp, i) => ({
  timestamp,
  devices: {
    'SW-01': { cpu: 10 + i, memory: 40 + i },
    'SW-02': { cpu: 20 + i, memory: 50 + i },
  },
}))

const temperatureHistory: TemperatureDataPoint[] = timestamps.map((timestamp, i) => ({
  timestamp,
  devices: { 'SW-01': 45 + i, 'SW-02': 50 + i },
}))

const gridLines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('line[stroke-dasharray]'))

/** 两张卡片的网格要求一致：横竖都是醒目虚线，且比数据线更弱（浅灰、1px） */
function expectProminentDashedGrid(container: HTMLElement) {
  const grids = gridLines(container)
  expect(grids.length).toBeGreaterThan(0)

  const horizontal = grids.filter((node) => node.getAttribute('y1') === node.getAttribute('y2'))
  const vertical = grids.filter((node) => node.getAttribute('x1') === node.getAttribute('x2'))
  expect(horizontal.length).toBeGreaterThan(0)
  expect(vertical.length).toBeGreaterThan(0)

  for (const node of grids) {
    expect(node.getAttribute('stroke')).toBe('#bcc6d2')
    expect(node.getAttribute('stroke-dasharray')).toBe('6,5')
  }
}

describe('监控中心图表网格（更醒目的横竖虚线）', () => {
  it('系统性能趋势图：横竖网格线均为醒目虚线', () => {
    const { container } = render(
      <SystemPerformanceChart data={systemPerformance} timeRange="1h" />
    )

    expectProminentDashedGrid(container)
  })

  it('设备温度监控图：横竖网格线均为醒目虚线', () => {
    const { container } = render(<TemperatureChart data={temperatureHistory} timeRange="1h" />)

    expectProminentDashedGrid(container)
  })
})
