import React, { createRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PerformanceSection } from '@/features/monitoring/components/sections/PerformanceSection'
import type { SystemPerformanceDataPoint, TemperatureDataPoint } from '@/features/monitoring/types'
import type {
  AggregateTrendPoint,
  ThresholdSummary,
} from '@/features/monitoring/types/zabbix-monitoring.types'

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

  it('systemPerformance 为空但 aggregateTrends 有数据时自动进入全网聚合态势', async () => {
    const agg: AggregateTrendPoint[] = [
      {
        timestamp: '2026-09-06T12:00:00Z',
        mean_cpu: 35,
        p95_cpu: 60,
        max_cpu: 72,
        mean_memory: 45,
        p95_memory: 68,
        max_memory: 75,
      },
    ]
    render(
      <PerformanceSection
        sectionRef={createRef<HTMLDivElement>()}
        chartsInView
        sectionSystemPerformance={{ ok: true }}
        sectionTemperature={{ ok: true }}
        systemPerformance={[]}
        temperatureHistory={[]}
        timeRange="1h"
        onRetry={jest.fn()}
        aggregateTrends={agg}
      />
    )

    expect(await screen.findByLabelText('全网聚合态势图')).toBeInTheDocument()
  })

  it('filterResetKey 变化时将手动切换的 modeOverride 重置为 auto', async () => {
    const devices: SystemPerformanceDataPoint['devices'] = {}
    for (let i = 1; i <= 6; i += 1) {
      devices[`SW-0${i}`] = { cpu: 20 + i, memory: 40 + i }
    }
    const sixDevices: SystemPerformanceDataPoint[] = [
      { timestamp: '2026-09-06T12:00:00Z', devices },
      { timestamp: '2026-09-06T12:05:00Z', devices },
    ]

    const { rerender } = render(
      <PerformanceSection
        sectionRef={createRef<HTMLDivElement>()}
        chartsInView
        sectionSystemPerformance={{ ok: true }}
        sectionTemperature={{ ok: true }}
        systemPerformance={sixDevices}
        temperatureHistory={[]}
        timeRange="1h"
        onRetry={jest.fn()}
        filterResetKey="all:"
      />
    )

    expect(await screen.findByLabelText('全网聚合态势图')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '精选设备对比' }))
    expect(await screen.findByLabelText('系统性能趋势图')).toBeInTheDocument()

    rerender(
      <PerformanceSection
        sectionRef={createRef<HTMLDivElement>()}
        chartsInView
        sectionSystemPerformance={{ ok: true }}
        sectionTemperature={{ ok: true }}
        systemPerformance={sixDevices}
        temperatureHistory={[]}
        timeRange="1h"
        onRetry={jest.fn()}
        filterResetKey="group-7:"
      />
    )

    expect(await screen.findByLabelText('全网聚合态势图')).toBeInTheDocument()
  })

  it('即使传入 thresholds，全网聚合态势与精选设备对比也不渲染阈值警示线，而设备温度监控保留阈值参考线', async () => {
    const thresholds: ThresholdSummary = {
      cpu: { warn: 80, crit: 90 },
      memory: { warn: 85, crit: 90 },
      temperature: { warn: 68, crit: 82 },
    }
    const temperatureHistory: TemperatureDataPoint[] = [
      { timestamp: '2026-09-06T12:00:00Z', devices: { 'SW-01': 55 } },
      { timestamp: '2026-09-06T12:05:00Z', devices: { 'SW-01': 60 } },
    ]
    const agg: AggregateTrendPoint[] = [
      {
        timestamp: '2026-09-06T12:00:00Z',
        mean_cpu: 35,
        p95_cpu: 60,
        max_cpu: 72,
        mean_memory: 45,
        p95_memory: 68,
        max_memory: 75,
      },
    ]

    const { container } = render(
      <PerformanceSection
        sectionRef={createRef<HTMLDivElement>()}
        chartsInView
        sectionSystemPerformance={{ ok: true }}
        sectionTemperature={{ ok: true }}
        systemPerformance={twoDevices}
        temperatureHistory={temperatureHistory}
        timeRange="1h"
        onRetry={jest.fn()}
        thresholds={thresholds}
        aggregateTrends={agg}
      />
    )

    // 默认进入精选设备对比（<= 5 台设备）
    await screen.findByLabelText('系统性能趋势图')
    await screen.findByLabelText('设备温度监控图')

    // 温度图仍保留 temp-warn / temp-crit 参考线
    expect(container.querySelector('[data-reference-line="temp-warn"]')).toBeInTheDocument()
    expect(container.querySelector('[data-reference-line="temp-crit"]')).toBeInTheDocument()
    // 系统性能趋势（精选设备对比）不渲染 CPU/内存/严重 阈值警示线
    expect(container.querySelector('[data-reference-line^="cpu-"]')).toBeNull()
    expect(container.querySelector('[data-reference-line^="memory-"]')).toBeNull()
    expect(container.querySelector('[data-reference-line^="perf-"]')).toBeNull()
    expect(screen.queryByText(/CPU 警告|内存 警告|严重 90%/)).not.toBeInTheDocument()

    // 切换至全网聚合态势，同样不渲染阈值警示线
    await userEvent.click(screen.getByRole('button', { name: '全网聚合态势' }))
    await screen.findByLabelText('全网聚合态势图')
    expect(container.querySelector('[data-reference-line^="cpu-"]')).toBeNull()
    expect(container.querySelector('[data-reference-line^="memory-"]')).toBeNull()
    expect(container.querySelector('[data-reference-line^="perf-"]')).toBeNull()
    expect(screen.queryByText(/CPU 警告|内存 警告|严重 90%/)).not.toBeInTheDocument()
  })
})
