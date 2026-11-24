import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopNRankingCard } from '@/features/monitoring/components/overview'
import {
  formatTopNValue,
  getTopNEmptyMessage,
  resolveTopNBarPresentation,
  resolveTopNInterfaceLabel,
} from '@/features/monitoring/components/overview/topNRankingHelpers'
import { getMonitoringTopN } from '@/features/monitoring/api/monitoring-hosts.api'
import type { ThresholdSummary, TopNMetric } from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => {
  const actual = jest.requireActual('@/features/monitoring/api/monitoring-hosts.api')
  return {
    ...actual,
    getMonitoringTopN: jest.fn(),
  }
})

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('TopNRankingCard 与 topNRankingHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('CPU 与内存支持动态阈值着色并展示设备 IP 与 title 提示', async () => {
    const user = userEvent.setup()
    const customThresholds: ThresholdSummary = {
      cpu: { warn: 60, crit: 75 },
      memory: { warn: 50, crit: 70 },
      temperature: { warn: 65, crit: 80 },
    }

    ;(getMonitoringTopN as jest.Mock).mockImplementation(async (metric: TopNMetric) => {
      if (metric === 'cpu') {
        return {
          metric: 'cpu',
          unit: '%',
          items: [
            {
              device_id: 1,
              device_name: 'Core-SW-01',
              ip_address: '10.0.0.1',
              status: 'online',
              value: 78.5,
              unit: '%',
            },
            {
              device_id: 2,
              device_name: 'Dist-SW-02',
              ip_address: '10.0.0.2',
              status: 'online',
              value: 62,
              unit: '%',
            },
            {
              device_id: 3,
              device_name: 'Access-SW-03',
              ip_address: '10.0.0.3',
              status: 'online',
              value: 40,
              unit: '%',
            },
          ],
        }
      }
      return {
        metric: 'memory',
        unit: '%',
        items: [
          {
            device_id: 4,
            device_name: 'Core-RTR-04',
            ip_address: '10.0.0.4',
            status: 'online',
            value: 72.18,
            unit: '%',
          },
          {
            device_id: 5,
            device_name: 'Edge-RTR-05',
            ip_address: '10.0.0.5',
            status: 'online',
            value: 55,
            unit: '%',
          },
        ],
      }
    })

    renderWithQuery(<TopNRankingCard groupId={null} thresholds={customThresholds} />)

    expect(await screen.findByText('Core-SW-01')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('78.5%')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()

    expect(screen.getByTestId('topn-bar-0')).toHaveAttribute('data-severity', 'danger')
    expect(screen.getByTestId('topn-bar-0')).toHaveClass('bg-danger')
    expect(screen.getByTestId('topn-bar-1')).toHaveAttribute('data-severity', 'warning')
    expect(screen.getByTestId('topn-bar-1')).toHaveClass('bg-warning')
    expect(screen.getByTestId('topn-bar-2')).toHaveAttribute('data-severity', 'normal')
    expect(screen.getByTestId('topn-bar-2')).toHaveClass('bg-primary')

    const cpuRow0 = screen.getByText('Core-SW-01').closest('button')
    expect(cpuRow0).toHaveAttribute('title', 'Core-SW-01 · (10.0.0.1) · 78.5%')

    await user.click(screen.getByRole('button', { name: '内存' }))
    expect(await screen.findByText('72.18%')).toBeInTheDocument()
    expect(screen.getByTestId('topn-bar-0')).toHaveAttribute('data-severity', 'danger')
    expect(screen.getByTestId('topn-bar-1')).toHaveAttribute('data-severity', 'warning')
  })

  it('温度 35°C 不变红且 86°C 变红，延迟 17 ms 不变红且 120 ms 变红', async () => {
    const user = userEvent.setup()
    ;(getMonitoringTopN as jest.Mock).mockImplementation(async (metric: TopNMetric) => {
      if (metric === 'temperature') {
        return {
          metric: 'temperature',
          unit: '°C',
          items: [
            {
              device_id: 11,
              device_name: 'Hot-SW',
              ip_address: '10.1.0.11',
              status: 'online',
              value: 86,
              unit: '°C',
            },
            {
              device_id: 12,
              device_name: 'Cool-SW',
              ip_address: '10.1.0.12',
              status: 'online',
              value: 35,
              unit: '°C',
            },
          ],
        }
      }
      if (metric === 'ping_rtt') {
        return {
          metric: 'ping_rtt',
          unit: 'ms',
          items: [
            {
              device_id: 13,
              device_name: 'Slow-GW',
              ip_address: '10.1.0.13',
              status: 'online',
              value: 120,
              unit: 'ms',
            },
            {
              device_id: 14,
              device_name: 'Fast-GW',
              ip_address: '10.1.0.14',
              status: 'online',
              value: 17,
              unit: 'ms',
            },
            {
              device_id: 15,
              device_name: 'Local-GW',
              ip_address: '10.1.0.15',
              status: 'online',
              value: 0.04,
              unit: 'ms',
            },
          ],
        }
      }
      return { metric, unit: '%', items: [] }
    })

    renderWithQuery(<TopNRankingCard groupId={null} />)

    await user.click(screen.getByRole('button', { name: '温度' }))
    expect(await screen.findByText('86°C')).toBeInTheDocument()
    expect(screen.getByText('35°C')).toBeInTheDocument()
    expect(screen.getByTestId('topn-bar-0')).toHaveAttribute('data-severity', 'danger')
    expect(screen.getByTestId('topn-bar-0')).toHaveClass('bg-danger')
    expect(screen.getByTestId('topn-bar-1')).toHaveAttribute('data-severity', 'normal')
    expect(screen.getByTestId('topn-bar-1')).toHaveClass('bg-primary')

    await user.click(screen.getByRole('button', { name: '延迟' }))
    expect(await screen.findByText('120 ms')).toBeInTheDocument()
    expect(screen.getByText('17 ms')).toBeInTheDocument()
    expect(screen.getByText('< 0.1 ms')).toBeInTheDocument()
    expect(screen.getByTestId('topn-bar-0')).toHaveAttribute('data-severity', 'danger')
    expect(screen.getByTestId('topn-bar-0')).toHaveClass('bg-danger')
    expect(screen.getByTestId('topn-bar-1')).toHaveAttribute('data-severity', 'normal')
    expect(screen.getByTestId('topn-bar-1')).toHaveClass('bg-primary')
  })

  it('接口利用率展示 < 0.01% 与 GigabitEthernet0/0/1 并彻底隐藏 if6，错包展示 12 个且 0 值无进度条', async () => {
    const user = userEvent.setup()
    ;(getMonitoringTopN as jest.Mock).mockImplementation(async (metric: TopNMetric) => {
      if (metric === 'if_util') {
        return {
          metric: 'if_util',
          unit: '%',
          items: [
            {
              device_id: 21,
              device_name: 'Core-SW-21',
              ip_address: '10.2.0.21',
              status: 'online',
              interface_name: 'if6',
              interface_display_name: 'GigabitEthernet0/0/1',
              value: 0.004,
              unit: '%',
            },
            {
              device_id: 22,
              device_name: 'Core-SW-22',
              ip_address: '10.2.0.22',
              status: 'online',
              interface_name: 'if9',
              value: 72,
              unit: '%',
            },
          ],
        }
      }
      if (metric === 'if_errors') {
        return {
          metric: 'if_errors',
          unit: 'count',
          items: [
            {
              device_id: 21,
              device_name: 'Core-SW-21',
              ip_address: '10.2.0.21',
              status: 'online',
              interface_name: 'if6',
              interface_display_name: 'GigabitEthernet0/0/1',
              value: 12,
              unit: 'count',
            },
            {
              device_id: 23,
              device_name: 'Core-SW-23',
              ip_address: '10.2.0.23',
              status: 'online',
              interface_name: 'GigabitEthernet0/0/2',
              value: 0,
              unit: 'count',
            },
          ],
        }
      }
      return { metric, unit: '%', items: [] }
    })

    const { container } = renderWithQuery(<TopNRankingCard groupId={null} />)

    await user.click(screen.getByRole('button', { name: '接口利用率' }))
    expect(await screen.findByText('GigabitEthernet0/0/1')).toBeInTheDocument()
    expect(screen.getByText('< 0.01%')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bif(?:6|9)\b/i)

    await user.click(screen.getByRole('button', { name: '错包' }))
    expect(await screen.findByText('12 个')).toBeInTheDocument()
    expect(screen.getByText('0 个')).toBeInTheDocument()
    expect(screen.getByTestId('topn-bar-0')).toHaveAttribute('data-severity', 'warning')
    expect(screen.getByTestId('topn-bar-1')).toHaveAttribute('data-severity', 'normal')
    expect(screen.getByTestId('topn-bar-1')).toHaveStyle({ width: '0%' })
    expect(container.textContent).not.toMatch(/\bif6\b/i)
  })

  it('6 项指标各自渲染专属中文空态提示', async () => {
    const user = userEvent.setup()
    ;(getMonitoringTopN as jest.Mock).mockResolvedValue({
      metric: 'cpu',
      unit: '%',
      items: [],
    })

    renderWithQuery(<TopNRankingCard groupId={null} />)

    const cases: Array<{ label: string; expectedEmpty: string }> = [
      { label: 'CPU', expectedEmpty: '暂无 CPU 负载数据' },
      { label: '内存', expectedEmpty: '暂无内存负载数据' },
      { label: '温度', expectedEmpty: '暂无温度采样数据' },
      { label: '接口利用率', expectedEmpty: '暂无活跃流量接口负载数据' },
      { label: '错包', expectedEmpty: '暂无端口错包记录' },
      { label: '延迟', expectedEmpty: '暂无延迟探测数据' },
    ]

    for (const item of cases) {
      await user.click(screen.getByRole('button', { name: item.label }))
      expect(await screen.findByText(item.expectedEmpty)).toBeInTheDocument()
    }
  })

  it('透传规范化后的 deviceIds 给 getMonitoringTopN（去重排序过滤非正整数）', async () => {
    ;(getMonitoringTopN as jest.Mock).mockResolvedValue({
      metric: 'cpu',
      unit: '%',
      items: [],
    })

    renderWithQuery(
      <TopNRankingCard groupId={3} deviceIds={[12, 0, -5, 4, 12, 1.5, 8]} />
    )

    await waitFor(() => {
      expect(getMonitoringTopN).toHaveBeenCalledWith('cpu', 5, 3, [4, 8, 12])
    })
  })

  it('纯工具函数边界值与 display_value 覆盖行为正确', () => {
    expect(resolveTopNInterfaceLabel({ interface_name: 'if6', interface_display_name: 'GE0/0/1' })).toBe('GE0/0/1')
    expect(resolveTopNInterfaceLabel({ interface_name: 'if12' })).toBe('')
    expect(resolveTopNInterfaceLabel({ interface_name: 'Eth-Trunk1' })).toBe('Eth-Trunk1')

    expect(formatTopNValue('cpu', { value: 1, unit: '%' })).toBe('1%')
    expect(formatTopNValue('cpu', { value: 88.5, unit: '%', display_value: '88.50 %' })).toBe('88.50 %')
    expect(formatTopNValue('if_errors', { value: Number.NaN, unit: 'count' })).toBe('0 个')

    expect(resolveTopNBarPresentation('cpu', Number.NaN, 100)).toEqual({
      widthPct: 0,
      barClassName: 'bg-primary',
      severity: 'normal',
    })
    expect(resolveTopNBarPresentation('if_errors', 120, 120).severity).toBe('danger')
    expect(getTopNEmptyMessage('ping_rtt')).toBe('暂无延迟探测数据')
  })
})
