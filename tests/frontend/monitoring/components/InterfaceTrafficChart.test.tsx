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

/** 横轴范围 = 所选时间窗口，窗口终点取自当前时间：把当前时间钉住 */
const freezeNow = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime())

// 默认钉在样本 points 之后，使其落在 1h 窗口内；需要别的「当前时间」的用例自行覆盖
beforeEach(() => {
  freezeNow('2026-09-10T02:15:00Z')
})

afterEach(() => {
  jest.restoreAllMocks()
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

// 设备离线、采集停摆期间没有数据点：相邻两点相隔超过两个采样周期（5 分钟 × 2，与后端速率窗口
// RateSampleMaxGap 同一口径）即视为中断，曲线与面积都必须在缺口处断开，不能把缺口补成「一直有流量」。
describe('InterfaceTrafficChart 数据缺口', () => {
  const at = (timestamp: string): NetworkTrafficDataPoint => ({ timestamp, inbound: 1, outbound: 2 })
  const lines = (container: HTMLElement, key: string) => container.querySelectorAll(`path[data-series="${key}"]`)
  const areas = (container: HTMLElement, key: string) => container.querySelectorAll(`path[data-area="${key}"]`)
  const dots = (container: HTMLElement, key: string) => container.querySelectorAll(`circle[data-series="${key}"]`)

  it('离线近 20 小时的缺口两侧各成一段，曲线与面积都不跨缺口', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = ['2026-11-08T02:25:00Z', '2026-11-08T02:30:00Z', '2026-11-08T02:35:00Z', '2026-11-08T22:20:00Z', '2026-11-08T22:25:00Z'].map(at)
    const { container } = render(<InterfaceTrafficChart data={data} timeRange="24h" height={240} />)

    for (const key of ['outbound', 'inbound']) {
      expect(lines(container, key)).toHaveLength(2)
      expect(areas(container, key)).toHaveLength(2)
    }
  })

  it('只缺一个采样点（如后端重启漏掉一轮）时仍连成一段', () => {
    freezeNow('2026-11-09T00:30:00Z')
    const data = ['2026-11-09T00:00:00Z', '2026-11-09T00:05:00Z', '2026-11-09T00:15:00Z', '2026-11-09T00:20:00Z'].map(at)
    const { container } = render(<InterfaceTrafficChart data={data} timeRange="1h" height={240} />)

    expect(lines(container, 'outbound')).toHaveLength(1)
    expect(lines(container, 'inbound')).toHaveLength(1)
  })

  it('两侧都是缺口的孤立采样点画成圆点，不能因断线而消失', () => {
    freezeNow('2026-11-09T02:30:00Z')
    const data = ['2026-11-09T00:00:00Z', '2026-11-09T00:05:00Z', '2026-11-09T01:00:00Z', '2026-11-09T02:00:00Z', '2026-11-09T02:05:00Z'].map(at)
    const { container } = render(<InterfaceTrafficChart data={data} timeRange="3h" height={240} />)

    for (const key of ['outbound', 'inbound']) {
      expect(lines(container, key)).toHaveLength(2)
      expect(dots(container, key)).toHaveLength(1)
    }
  })
})

// 横轴范围 = 所选时间窗口（而非数据首尾），与系统性能趋势图一致：缺口在窗口开头或末尾时也看得见
describe('InterfaceTrafficChart 横轴范围', () => {
  const at = (timestamp: string): NetworkTrafficDataPoint => ({ timestamp, inbound: 1, outbound: 2 })
  const lines = (container: HTMLElement) => Array.from(container.querySelectorAll('path[data-series="outbound"]'))
  /** 路径起点 x（d 形如 "M12.3,45.6C..."） */
  const startX = (path: Element) => Number(/^M\s*(-?[\d.]+)/.exec(path.getAttribute('d') ?? '')?.[1])
  /** 路径终点 x（d 的最后一对坐标） */
  const endX = (path: Element) => {
    const numbers = (path.getAttribute('d') ?? '').match(/-?[\d.]+/g) ?? []
    return Number(numbers[numbers.length - 2])
  }

  it('24h 档只有最后 1 小时有数据时，曲线挤在右侧而不是拉满整个宽度', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = Array.from({ length: 12 }, (_, i) =>
      at(new Date(Date.UTC(2026, 10, 8, 23, 0) + i * 5 * 60_000).toISOString())
    )
    const { container } = render(<InterfaceTrafficChart data={data} timeRange="24h" height={240} />)

    const [path] = lines(container)
    // 23:00 位于 24h 窗口的 23/24 处；若按数据首尾定范围，起点会落在 0
    expect(startX(path) / endX(path)).toBeGreaterThan(0.9)
  })

  it('早于窗口起点的点不绘制', () => {
    freezeNow('2026-11-09T00:00:00Z')
    const data = ['2026-11-07T18:00:00Z', '2026-11-08T23:50:00Z', '2026-11-08T23:55:00Z'].map(at)
    const { container } = render(<InterfaceTrafficChart data={data} timeRange="24h" height={240} />)

    expect(lines(container)).toHaveLength(1)
    expect(container.querySelectorAll('circle[data-series="outbound"]')).toHaveLength(0)
  })
})
