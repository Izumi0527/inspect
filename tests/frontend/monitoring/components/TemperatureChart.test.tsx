import React from 'react'
import { render, screen } from '@testing-library/react'
import { TemperatureChart } from '@/features/monitoring/components/charts/TemperatureChart'
import type { TemperatureDataPoint } from '@/features/monitoring/types'

// jsdom 不实现 SVG 文本测量，@visx/text 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

/** 横轴范围 = 所选时间窗口，窗口终点取自当前时间：把当前时间钉住 */
const freezeNow = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime())

afterEach(() => {
  jest.restoreAllMocks()
})

const linePaths = (container: HTMLElement, device: string) =>
  container.querySelectorAll(`path[data-series="${device}"]`)
const dots = (container: HTMLElement, device: string) =>
  container.querySelectorAll(`circle[data-series="${device}"]`)
/** 路径起点 x（d 形如 "M12.3,45.6C..."） */
const startX = (path: Element) => Number(/^M\s*(-?[\d.]+)/.exec(path.getAttribute('d') ?? '')?.[1])
/** 路径终点 x（d 的最后一对坐标） */
const endX = (path: Element) => {
  const numbers = (path.getAttribute('d') ?? '').match(/-?[\d.]+/g) ?? []
  return Number(numbers[numbers.length - 2])
}

/** 按分钟偏移生成温度点（所有列出的设备同温） */
const series = (baseIso: string, minutes: number[], devices: string[], celsius = 45): TemperatureDataPoint[] =>
  minutes.map((offset) => ({
    timestamp: new Date(new Date(baseIso).getTime() + offset * 60_000).toISOString(),
    devices: Object.fromEntries(devices.map((name) => [name, celsius])),
  }))

describe('TemperatureChart 基本展示', () => {
  beforeEach(() => {
    freezeNow('2026-11-09T01:00:00Z')
  })

  it('无数据时显示暂无温度数据', () => {
    render(<TemperatureChart data={[]} timeRange="1h" />)
    expect(screen.getByText('暂无温度数据')).toBeInTheDocument()
  })

  it('超过 5 台设备时只绘制前 5 台并提示上限', () => {
    const devices = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']
    const { container } = render(
      <TemperatureChart data={series('2026-11-09T00:30:00Z', [0, 5], devices)} timeRange="1h" />
    )

    expect(linePaths(container, 'D5')).toHaveLength(1)
    expect(linePaths(container, 'D6')).toHaveLength(0)
    expect(screen.getByText('(最多显示5个设备)')).toBeInTheDocument()
  })

  it('设备温度达到阈值时图例带 [!] 标记', () => {
    const data = [
      ...series('2026-11-09T00:30:00Z', [0, 5], ['HOT'], 80),
      ...series('2026-11-09T00:30:00Z', [0, 5], ['COOL'], 40),
    ]
    render(<TemperatureChart data={data} timeRange="1h" temperatureThreshold={75} />)

    expect(screen.getByText('HOT').querySelector('span')).toHaveTextContent('[!]')
    expect(screen.getByText('COOL').querySelector('span')).toBeNull()
  })
})

// 横轴是真实时间轴：与流量图、性能图同一断线口径，缺失不补 0℃
describe('TemperatureChart 数据缺口', () => {
  it('离线近 20 小时的缺口两侧各成一段，不跨缺口连线', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = [
      ...series('2026-11-08T02:25:00Z', [0, 5, 10], ['SW-01']),
      ...series('2026-11-08T22:20:00Z', [0, 5], ['SW-01']),
    ]
    const { container } = render(<TemperatureChart data={data} timeRange="24h" />)

    expect(linePaths(container, 'SW-01')).toHaveLength(2)
  })

  it('多设备时某台设备缺数据处断开，而不是补 0℃ 掉底', () => {
    freezeNow('2026-11-09T01:00:00Z')
    const data = [
      ...series('2026-11-09T00:00:00Z', [0, 5], ['SW-01', 'SW-02']),
      ...series('2026-11-09T00:00:00Z', [10, 15, 20], ['SW-01']),
      ...series('2026-11-09T00:00:00Z', [25, 30], ['SW-01', 'SW-02']),
    ]
    const { container } = render(<TemperatureChart data={data} timeRange="1h" />)

    expect(linePaths(container, 'SW-01')).toHaveLength(1)
    expect(linePaths(container, 'SW-02')).toHaveLength(2)
  })

  it('两侧都是缺口的孤立采样点画成圆点', () => {
    freezeNow('2026-11-09T03:00:00Z')
    const { container } = render(
      <TemperatureChart data={series('2026-11-09T00:00:00Z', [0, 5, 60, 120, 125], ['SW-01'])} timeRange="3h" />
    )

    expect(linePaths(container, 'SW-01')).toHaveLength(2)
    expect(dots(container, 'SW-01')).toHaveLength(1)
  })
})

describe('TemperatureChart 横轴范围', () => {
  it('24h 档只有最后 1 小时有数据时，曲线挤在右侧而不是拉满整个宽度', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
    const { container } = render(
      <TemperatureChart data={series('2026-11-08T23:00:00Z', minutes, ['SW-01'])} timeRange="24h" />
    )

    const [path] = Array.from(linePaths(container, 'SW-01'))
    expect(startX(path) / endX(path)).toBeGreaterThan(0.9)
  })

  it('早于窗口起点的点不绘制', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = [
      ...series('2026-11-07T18:00:00Z', [0], ['SW-01']),
      ...series('2026-11-08T23:50:00Z', [0, 5], ['SW-01']),
    ]
    const { container } = render(<TemperatureChart data={data} timeRange="24h" />)

    expect(linePaths(container, 'SW-01')).toHaveLength(1)
    expect(dots(container, 'SW-01')).toHaveLength(0)
  })
})
