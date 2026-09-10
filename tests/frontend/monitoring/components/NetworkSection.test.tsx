import React, { createRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NetworkSection } from '@/features/monitoring/components/sections/NetworkSection'
import type { DeviceInterfaceTraffic, NetworkTrafficDataPoint } from '@/features/monitoring/types'

jest.mock('@/components/ui/select', () => require('./helpers/selectMock').createSelectMock())

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

jest.mock('@/features/monitoring/components/charts', () => ({
  InterfaceTrafficChartWrapper: ({ data }: { data: NetworkTrafficDataPoint[] }) => (
    <div data-testid="traffic-chart">{data.length} points</div>
  ),
  TrafficSeriesLegend: () => <ul aria-label="流量序列图例" />,
  ChartSkeleton: () => <div data-testid="chart-skeleton" />,
}))

const mockUseMonitoringDevices = jest.fn()
jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: () => mockUseMonitoringDevices(),
}))

const mockUseDeviceInterfaceTraffic = jest.fn()
jest.mock('@/features/monitoring/hooks/useDeviceInterfaceTraffic', () => ({
  useDeviceInterfaceTraffic: (options: unknown) => mockUseDeviceInterfaceTraffic(options),
}))

const aggregatePoints: NetworkTrafficDataPoint[] = [
  { timestamp: '2026-09-10T02:00:00Z', inbound: 1, outbound: 2 },
  { timestamp: '2026-09-10T02:05:00Z', inbound: 1.5, outbound: 2.5 },
]

const interfaceTraffic: DeviceInterfaceTraffic = {
  deviceId: 6,
  interface: '',
  interfaces: [
    { name: 'if5', label: 'Vlanif1', speedMbps: 1000 },
    { name: 'if6', label: 'GigabitEthernet0/0/1', speedMbps: 1000 },
  ],
  points: [{ timestamp: '2026-09-10T02:00:00Z', inbound: 0.5, outbound: 0.25 }],
}

function queryResult(overrides: Partial<{ data: DeviceInterfaceTraffic; isPending: boolean; error: Error | null }> = {}) {
  return {
    data: interfaceTraffic,
    isPending: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  }
}

function renderSection(deviceIds: number[]) {
  return render(
    <NetworkSection
      sectionRef={createRef<HTMLDivElement>()}
      networkInView
      deviceIds={deviceIds}
      timeRange="1h"
      pageVisible
      sectionNetworkTraffic={{ ok: true }}
      networkTrafficHistory={aggregatePoints}
      onRetry={jest.fn()}
    />
  )
}

describe('NetworkSection（流量监控卡）', () => {
  beforeEach(() => {
    mockUseMonitoringDevices.mockReturnValue({
      data: [{ id: 6, name: '核心交换机', ipAddress: '192.168.20.1', status: 'online', isMonitored: true }],
      isLoading: false,
      error: null,
    })
    mockUseDeviceInterfaceTraffic.mockReset()
    mockUseDeviceInterfaceTraffic.mockReturnValue(queryResult())
  })

  it('勾选单台设备时展示该设备的 UP 接口选择器，默认「全部接口」', async () => {
    const user = userEvent.setup()
    renderSection([6])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, timeRange: '1h', interfaceName: '' })
    )
    expect(screen.getByText(/核心交换机/)).toBeInTheDocument()
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('1 points')

    await user.click(screen.getByRole('combobox', { name: '接口选择' }))
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByRole('option', { name: '全部接口（2 个 UP）' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Vlanif1' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'GigabitEthernet0/0/1' })).toBeInTheDocument()
  })

  it('切换到某个接口后按该接口重新查询', async () => {
    const user = userEvent.setup()
    renderSection([6])

    await user.click(screen.getByRole('combobox', { name: '接口选择' }))
    await user.click(screen.getByRole('option', { name: 'GigabitEthernet0/0/1' }))

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, interfaceName: 'if6' })
    )
  })

  it('全部设备（未筛选）时不发起接口流量查询，显示聚合曲线与提示', () => {
    renderSection([])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: null }))
    expect(screen.queryByRole('combobox', { name: '接口选择' })).not.toBeInTheDocument()
    expect(screen.getByText(/勾选单台设备可查看各接口流量/)).toBeInTheDocument()
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('2 points')
  })

  it('多选设备时同样走聚合视图', () => {
    renderSection([6, 7])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: null }))
    expect(screen.getByText(/已选 2 台/)).toBeInTheDocument()
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('2 points')
  })

  it('单设备没有 UP 接口时给出明确空态', () => {
    mockUseDeviceInterfaceTraffic.mockReturnValue(
      queryResult({ data: { ...interfaceTraffic, interfaces: [], points: [] } })
    )
    renderSection([6])

    expect(screen.getByText('该设备当前没有 UP 状态的接口')).toBeInTheDocument()
    expect(screen.queryByTestId('traffic-chart')).not.toBeInTheDocument()
  })

  it('接口流量查询失败时显示失败态并可重试', async () => {
    const refetch = jest.fn()
    mockUseDeviceInterfaceTraffic.mockReturnValue({
      ...queryResult({ data: undefined as unknown as DeviceInterfaceTraffic, error: new Error('接口流量加载失败') }),
      refetch,
    })
    renderSection([6])

    expect(screen.getByText('接口流量加载失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /重试/ }))
    expect(refetch).toHaveBeenCalled()
  })

  it('卡片内不再出现「总流量」与「网络流量」区块标题', () => {
    renderSection([])

    expect(screen.queryByText(/总流量/)).not.toBeInTheDocument()
    expect(screen.queryByText('网络流量')).not.toBeInTheDocument()
  })
})
