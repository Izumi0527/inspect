import React from 'react'
import { render, screen } from '@testing-library/react'
import { SystemPerformanceChart } from '@/features/monitoring/components/charts/SystemPerformanceChart'
import type { SystemPerformanceDataPoint } from '@/features/monitoring/types'

// jsdom 不实现 SVG 文本测量，@visx/text 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

/** 把「当前时间」钉住：横轴范围 = 所选时间窗口，窗口终点取自当前时间 */
const freezeNow = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime())

afterEach(() => {
  jest.restoreAllMocks()
})

const linePaths = (container: HTMLElement, key: string) =>
  container.querySelectorAll(`path[data-series="${key}"]`)
const dots = (container: HTMLElement, key: string) =>
  container.querySelectorAll(`circle[data-series="${key}"]`)
/** 所有已绘制序列（线段或孤立点）的去重 key */
const drawnSeries = (container: HTMLElement) =>
  Array.from(new Set(Array.from(container.querySelectorAll('[data-series]')).map((node) => node.getAttribute('data-series'))))
/** 路径起点 x（d 形如 "M12.3,45.6C..."） */
const startX = (path: Element) => Number(/^M\s*(-?[\d.]+)/.exec(path.getAttribute('d') ?? '')?.[1])
/** 路径终点 x（d 的最后一对坐标） */
const endX = (path: Element) => {
  const numbers = (path.getAttribute('d') ?? '').match(/-?[\d.]+/g) ?? []
  return Number(numbers[numbers.length - 2])
}

/** 按 5 分钟采样生成某台设备的点（minutes 为相对 baseIso 的分钟偏移） */
const series = (baseIso: string, minutes: number[], devices: string[]): SystemPerformanceDataPoint[] =>
  minutes.map((offset) => ({
    timestamp: new Date(new Date(baseIso).getTime() + offset * 60_000).toISOString(),
    devices: Object.fromEntries(devices.map((name) => [name, { cpu: 30, memory: 60 }])),
  }))

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
  beforeEach(() => {
    freezeNow('2026-09-06T12:10:00Z')
  })

  it('每台设备生成 CPU 实线与内存虚线，同一设备两条线同色，不同设备颜色不同', () => {
    const { container } = render(<SystemPerformanceChart data={twoDevices} timeRange="1h" />)

    const style = (key: string) => {
      const path = linePaths(container, key)[0]
      return `${path.getAttribute('stroke')}|${path.getAttribute('stroke-dasharray') ?? 'solid'}`
    }
    expect(['SW-01:cpu', 'SW-01:memory', 'SW-02:cpu', 'SW-02:memory'].map(style)).toEqual([
      '#3987E5|solid',
      '#3987E5|6 4',
      '#D95926|solid',
      '#D95926|6 4',
    ])
  })

  it('hiddenMetrics 含 memory 时只剩 CPU 线', () => {
    const { container } = render(
      <SystemPerformanceChart data={twoDevices} timeRange="1h" hiddenMetrics={new Set(['memory'])} />
    )

    expect(drawnSeries(container).sort()).toEqual(['SW-01:cpu', 'SW-02:cpu'])
  })

  it('底部设备图例列出设备名，且不再出现「网络」', () => {
    render(<SystemPerformanceChart data={twoDevices} timeRange="1h" />)

    const legend = screen.getByRole('list', { name: '设备图例' })
    expect(legend).toHaveTextContent('SW-01')
    expect(legend).toHaveTextContent('SW-02')
    expect(screen.queryByText('网络')).not.toBeInTheDocument()
  })

  it('两个指标都隐藏时显示提示而不是空图', () => {
    const { container } = render(
      <SystemPerformanceChart data={twoDevices} timeRange="1h" hiddenMetrics={new Set(['cpu', 'memory'])} />
    )

    expect(screen.getByText('已隐藏全部指标')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('超过 5 台设备时只绘制前 5 台并提示上限', () => {
    const devices: SystemPerformanceDataPoint['devices'] = {}
    for (let i = 1; i <= 6; i += 1) {
      devices[`DEV-${i}`] = { cpu: i, memory: i * 10 }
    }
    const { container } = render(
      <SystemPerformanceChart data={[{ timestamp: '2026-09-06T12:00:00Z', devices }]} timeRange="1h" />
    )

    const drawn = drawnSeries(container)
    expect(drawn).toHaveLength(10)
    expect(drawn.some((key) => key?.startsWith('DEV-6:'))).toBe(false)
    expect(screen.getByText('(最多显示5个设备)')).toBeInTheDocument()
  })

  it('无数据时显示暂无性能数据', () => {
    render(<SystemPerformanceChart data={[]} timeRange="1h" />)
    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()
  })
})

// 横轴是真实时间轴：相邻两点超过两个采样周期（与流量图、后端 RateSampleMaxGap 同一口径）即断线，
// 设备在某时刻没有数据就是没有数据——不能补成 0% 画成「掉底」。
describe('SystemPerformanceChart 数据缺口', () => {
  it('离线近 20 小时的缺口两侧各成一段，不跨缺口连线', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = [
      ...series('2026-11-08T02:25:00Z', [0, 5, 10], ['SW-01']),
      ...series('2026-11-08T22:20:00Z', [0, 5], ['SW-01']),
    ]
    const { container } = render(<SystemPerformanceChart data={data} timeRange="24h" />)

    expect(linePaths(container, 'SW-01:cpu')).toHaveLength(2)
    expect(linePaths(container, 'SW-01:memory')).toHaveLength(2)
  })

  it('多设备时某台设备缺数据处断开，而不是补 0 掉底', () => {
    freezeNow('2026-11-09T01:00:00Z')
    const data = [
      ...series('2026-11-09T00:00:00Z', [0, 5], ['SW-01', 'SW-02']),
      ...series('2026-11-09T00:00:00Z', [10, 15, 20], ['SW-01']),
      ...series('2026-11-09T00:00:00Z', [25, 30], ['SW-01', 'SW-02']),
    ]
    const { container } = render(<SystemPerformanceChart data={data} timeRange="1h" />)

    expect(linePaths(container, 'SW-01:cpu')).toHaveLength(1)
    expect(linePaths(container, 'SW-02:cpu')).toHaveLength(2)
  })

  it('两侧都是缺口的孤立采样点画成圆点，不能因断线而消失', () => {
    freezeNow('2026-11-09T03:00:00Z')
    const data = series('2026-11-09T00:00:00Z', [0, 5, 60, 120, 125], ['SW-01'])
    const { container } = render(<SystemPerformanceChart data={data} timeRange="3h" />)

    expect(linePaths(container, 'SW-01:cpu')).toHaveLength(2)
    expect(dots(container, 'SW-01:cpu')).toHaveLength(1)
  })
})

// 横轴范围 = 所选时间窗口（而非数据首尾）：缺口在窗口末尾或开头时也看得见
describe('SystemPerformanceChart 横轴范围', () => {
  it('24h 档只有最后 1 小时有数据时，曲线挤在右侧而不是拉满整个宽度', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = series('2026-11-08T23:00:00Z', [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], ['SW-01'])
    const { container } = render(<SystemPerformanceChart data={data} timeRange="24h" />)

    const [path] = Array.from(linePaths(container, 'SW-01:cpu'))
    // 23:00 位于 24h 窗口的 23/24 处；若按数据首尾定范围，起点会落在 0
    expect(startX(path) / endX(path)).toBeGreaterThan(0.9)
  })

  it('早于窗口起点的点不绘制', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = [
      ...series('2026-11-07T18:00:00Z', [0], ['SW-01']),
      ...series('2026-11-08T23:50:00Z', [0, 5], ['SW-01']),
    ]
    const { container } = render(<SystemPerformanceChart data={data} timeRange="24h" />)

    expect(linePaths(container, 'SW-01:cpu')).toHaveLength(1)
    expect(dots(container, 'SW-01:cpu')).toHaveLength(0)
  })
})
