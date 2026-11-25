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
  interface: 'if6',
  interfaces: [
    { name: 'if6', label: 'GigabitEthernet0/0/1', speedMbps: 1000 },
    { name: 'if7', label: 'GigabitEthernet0/0/2', speedMbps: 1000 },
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

function renderSection(deviceIds: number[], activeGroupName?: string | null) {
  return render(
    <NetworkSection
      sectionRef={createRef<HTMLDivElement>()}
      networkInView
      deviceIds={deviceIds}
      activeGroupName={activeGroupName}
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

  it('勾选单台设备时展示物理 UP 接口选择器，默认显示后端选中的首个物理口，无「全部接口」项', async () => {
    const user = userEvent.setup()
    renderSection([6])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, timeRange: '1h', interfaceName: '' })
    )
    expect(screen.getByText(/核心交换机/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '接口选择' })).toHaveTextContent('GigabitEthernet0/0/1')
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('1 points')

    await user.click(screen.getByRole('combobox', { name: '接口选择' }))
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).queryByRole('option', { name: /全部接口/ })).not.toBeInTheDocument()
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'GigabitEthernet0/0/1',
      'GigabitEthernet0/0/2',
    ])
  })

  it('切换到某个接口后按该接口重新查询', async () => {
    const user = userEvent.setup()
    renderSection([6])

    await user.click(screen.getByRole('combobox', { name: '接口选择' }))
    await user.click(screen.getByRole('option', { name: 'GigabitEthernet0/0/2' }))

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, interfaceName: 'if7' })
    )
  })

  it('全部设备（未筛选）时不发起接口流量查询，显示聚合曲线、口径说明与提示', () => {
    renderSection([])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: null }))
    expect(screen.queryByRole('combobox', { name: '接口选择' })).not.toBeInTheDocument()
    expect(screen.getByText('全部设备')).toBeInTheDocument()
    const scopeHint = screen.getByText('活跃设备物理口聚合总吞吐').closest('[data-slot="traffic-aggregate-scope-hint"]')
    expect(scopeHint).toBeInTheDocument()
    expect(scopeHint).toHaveAttribute('title', expect.stringContaining('活跃设备的物理接口总吞吐'))
    expect(screen.getByText(/勾选单台设备可查看各接口流量/)).toBeInTheDocument()
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('2 points')
  })

  it('按分组筛选且未选单台设备时显示分组名称与聚合口径说明', () => {
    renderSection([], '核心机房')

    expect(screen.getByText('分组 · 核心机房')).toBeInTheDocument()
    expect(screen.queryByText('全部设备')).not.toBeInTheDocument()
    expect(screen.getByText('活跃设备物理口聚合总吞吐')).toBeInTheDocument()
  })

  it('多选设备时同样走聚合视图并展示聚合口径说明', () => {
    renderSection([6, 7])

    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: null }))
    expect(screen.getByText(/已选 2 台/)).toBeInTheDocument()
    expect(screen.getByText('活跃设备物理口聚合总吞吐')).toBeInTheDocument()
    expect(screen.getByTestId('traffic-chart')).toHaveTextContent('2 points')
  })

  it('单设备没有 UP 物理或聚合接口时给出明确空态', () => {
    mockUseDeviceInterfaceTraffic.mockReturnValue(
      queryResult({ data: { ...interfaceTraffic, interface: '', interfaces: [], points: [] } })
    )
    renderSection([6])

    expect(screen.getByText('该设备当前没有 UP 状态的物理或聚合接口')).toBeInTheDocument()
    expect(screen.queryByTestId('traffic-chart')).not.toBeInTheDocument()
  })

  it('单设备视图支持展示与切换 Eth-Trunk 聚合口流量', async () => {
    const user = userEvent.setup()
    mockUseDeviceInterfaceTraffic.mockReturnValue(
      queryResult({
        data: {
          ...interfaceTraffic,
          interfaces: [
            { name: 'if6', label: 'GigabitEthernet0/0/1', speedMbps: 1000 },
            { name: 'if8', label: 'Eth-Trunk1', description: '核心聚合上行', speedMbps: 2000 },
          ],
        },
      })
    )

    renderSection([6])

    await user.click(screen.getByRole('combobox', { name: '接口选择' }))
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[1]).toHaveTextContent('Eth-Trunk1')
    expect(options[1].querySelector('[data-slot="select-item-description"]')).toHaveTextContent('核心聚合上行')

    await user.click(options[1])
    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, interfaceName: 'if8' })
    )
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

  it('接口描述仅在下拉展开时于接口名旁显示，有则显示、无则不显示，触发器始终只显示接口名', async () => {
    const user = userEvent.setup()
    mockUseDeviceInterfaceTraffic.mockReturnValue(
      queryResult({
        data: {
          ...interfaceTraffic,
          interfaces: [
            { name: 'if6', label: 'GigabitEthernet0/0/1', description: '上联核心交换机', speedMbps: 1000 },
            { name: 'if7', label: 'GigabitEthernet0/0/2', speedMbps: 1000 },
            { name: 'if8', label: 'GigabitEthernet0/0/3', description: '接入楼层汇聚', speedMbps: 1000 },
          ],
        },
      })
    )

    renderSection([6])

    const combobox = screen.getByRole('combobox', { name: '接口选择' })
    // 未展开时触发器仅显示接口名，且不渲染 listbox
    expect(combobox).toHaveTextContent('GigabitEthernet0/0/1')
    expect(combobox).not.toHaveTextContent('上联核心交换机')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // 展开下拉后：有描述的接口在旁显示描述，无描述的不显示描述元素
    await user.click(combobox)
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(3)

    expect(options[0]).toHaveTextContent('GigabitEthernet0/0/1')
    expect(options[0].querySelector('[data-slot="select-item-description"]')).toHaveTextContent('上联核心交换机')

    expect(options[1]).toHaveTextContent('GigabitEthernet0/0/2')
    expect(options[1].querySelector('[data-slot="select-item-description"]')).toBeNull()

    expect(options[2]).toHaveTextContent('GigabitEthernet0/0/3')
    expect(options[2].querySelector('[data-slot="select-item-description"]')).toHaveTextContent('接入楼层汇聚')

    // 选中另一个带描述的接口后，触发器仍只显示接口名，不显示描述
    await user.click(options[2])
    expect(mockUseDeviceInterfaceTraffic).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: 6, interfaceName: 'if8' })
    )
    expect(combobox).toHaveTextContent('GigabitEthernet0/0/3')
    expect(combobox).not.toHaveTextContent('接入楼层汇聚')
  })

  it('卡片内不再出现「总流量」与「网络流量」区块标题', () => {
    renderSection([])

    expect(screen.queryByText(/总流量/)).not.toBeInTheDocument()
    expect(screen.queryByText('网络流量')).not.toBeInTheDocument()
  })
})
