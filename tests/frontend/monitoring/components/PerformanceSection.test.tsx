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

jest.mock('@/components/atoms/charts', () => ({
  LineChartComponent: ({ lines }: { lines: Array<{ key: string; name?: string }> }) => (
    <ul data-testid="chart-lines">
      {lines.map((line) => (
        <li key={line.key}>{line.name}</li>
      ))}
    </ul>
  ),
}))

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

const chartLineNames = () =>
  within(screen.getByTestId('chart-lines'))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('PerformanceSection（系统性能趋势卡片）', () => {
  it('指标图例位于「系统性能趋势」标题同一行（卡片头部右侧），且不含「网络」', async () => {
    renderSection(twoDevices)
    await screen.findByTestId('chart-lines')

    const legend = screen.getByRole('group', { name: '指标显隐' })
    expect(legend.parentElement).toHaveTextContent('系统性能趋势')
    expect(within(legend).getByRole('button', { name: 'CPU' })).toBeInTheDocument()
    expect(within(legend).getByRole('button', { name: '内存' })).toBeInTheDocument()
    expect(screen.queryByText('网络')).not.toBeInTheDocument()
  })

  it('点击「内存」后图表只保留各设备的 CPU 线，再点一次恢复', async () => {
    renderSection(twoDevices)
    await screen.findByTestId('chart-lines')
    expect(chartLineNames()).toEqual(['SW-01 CPU', 'SW-01 内存', 'SW-02 CPU', 'SW-02 内存'])

    await userEvent.click(screen.getByRole('button', { name: '内存' }))
    expect(chartLineNames()).toEqual(['SW-01 CPU', 'SW-02 CPU'])
    expect(screen.getByRole('button', { name: '内存' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: '内存' }))
    expect(chartLineNames()).toEqual(['SW-01 CPU', 'SW-01 内存', 'SW-02 CPU', 'SW-02 内存'])
  })

  it('无性能数据时显示空态且不渲染指标图例', () => {
    renderSection([])

    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '指标显隐' })).not.toBeInTheDocument()
  })
})
