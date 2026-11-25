import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast, { Toaster } from 'react-hot-toast'
import { LatestDataTab } from '@/features/monitoring/components/latest'
import {
  buildLatestDataQueryKey,
  compareLatestDataItemsNaturally,
  formatSeriesDisplayName,
} from '@/features/monitoring/components/latest/latestDataHelpers'
import {
  getAdhocGraphs,
  getLatestData,
} from '@/features/monitoring/api/monitoring-hosts.api'
import { useMonitoringDevices } from '@/features/monitoring/hooks/useMonitoringDevices'
import type { LatestDataItem } from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/components/ui/select', () =>
  require('./components/helpers/selectMock').createSelectMock()
)

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getLatestData: jest.fn(),
  getAdhocGraphs: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: jest.fn(),
}))

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

function makeMetricItem(idx: number): LatestDataItem {
  return {
    device_id: 30 + idx,
    device_name: `SW-0${idx}`,
    ip_address: `10.30.0.${idx}`,
    metric_name: 'cpu_usage',
    metric_label: `CPU 使用率-${idx}`,
    interface_name: idx === 1 ? 'GE0/0/1' : '',
    item_key: `cpu.usage.${idx}`,
    application_tag: 'system',
    metric_value: 40 + idx * 5,
    prev_value: 35 + idx * 5,
    delta: 5,
    display_value: idx === 7 ? '正常 (UP)' : `${40 + idx * 5}.00 %`,
    metric_unit: '%',
    is_abnormal: idx === 2,
    collected_at: '2026-11-20T12:15:00Z',
  }
}

describe('实时指标明细与多指标同图对比 LatestDataTab (Task 12)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useMonitoringDevices as jest.Mock).mockReturnValue({
      data: [
        { id: 31, name: 'SW-01', ipAddress: '10.30.0.1', status: 'online', isMonitored: true },
      ],
      devices: [
        { id: 31, name: 'SW-01', ipAddress: '10.30.0.1', status: 'online', isMonitored: true },
      ],
      isLoading: false,
      error: null,
    })
    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [1, 2, 3, 4, 5, 6, 7].map(makeMetricItem),
      total: 120,
      page: 1,
      page_size: 50,
      total_pages: 3,
    })
    ;(getAdhocGraphs as jest.Mock).mockResolvedValue({
      timestamps: ['2026-11-20T12:00:00Z', '2026-11-20T12:05:00Z'],
      start_time: '2026-11-20T11:15:00Z',
      end_time: '2026-11-20T12:15:00Z',
      series: [
        {
          key: '31:cpu_usage:GE0/0/1',
          device_id: 31,
          device_name: 'SW-01',
          metric_name: 'cpu_usage',
          metric_label: 'CPU 使用率-1',
          interface_name: 'GE0/0/1',
          unit: '%',
          values: [42, 45],
        },
        {
          key: '32:cpu_usage:',
          device_id: 32,
          device_name: 'SW-02',
          metric_name: 'cpu_usage',
          metric_label: 'CPU 使用率-2',
          unit: '%',
          values: [82, 88],
        },
      ],
    })
  })

  it('大网默认提醒、仅看异常与近期变动筛选及真分页检索', async () => {
    const user = userEvent.setup()
    const onSelectHost = jest.fn()

    renderWithQuery(
      <LatestDataTab
        activeGroupId={null}
        selectedDeviceIds={[]}
        onSelectHost={onSelectHost}
      />
    )

    expect(screen.getByText(/大网提示：当前未限定设备或分组/)).toBeInTheDocument()
    expect(await screen.findByText('CPU 使用率-1')).toBeInTheDocument()
    expect(screen.queryByText('cpu.usage.1')).not.toBeInTheDocument()
    expect(screen.getByText('GE0/0/1')).toBeInTheDocument()
    expect(screen.getByText('正常 (UP)')).toBeInTheDocument()

    await user.click(screen.getByRole('switch'))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith(
        expect.objectContaining({ abnormal_only: true, changed_only: true, page: 1 })
      )
    })

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      )
    })

    await user.click(screen.getByRole('button', { name: 'SW-01' }))
    expect(onSelectHost).toHaveBeenCalledWith(31)

    // 下拉筛选：按设备与按指标分类
    await user.click(screen.getByRole('combobox', { name: '按设备筛选指标' }))
    await user.click(screen.getByRole('option', { name: 'SW-01 (10.30.0.1)' }))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith(
        expect.objectContaining({ device_ids: [31], page: 1 })
      )
    })

    await user.click(screen.getByRole('combobox', { name: '按指标分类筛选' }))
    await user.click(screen.getByRole('option', { name: '系统性能' }))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith(
        expect.objectContaining({ application_tag: 'system', page: 1 })
      )
    })

    // 重置回全部设备与全部分类
    await user.click(screen.getByRole('combobox', { name: '按设备筛选指标' }))
    await user.click(screen.getByRole('option', { name: '全部设备' }))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith(
        expect.objectContaining({ device_ids: undefined, application_tag: 'system', page: 1 })
      )
    })
    await user.click(screen.getByRole('combobox', { name: '按指标分类筛选' }))
    await user.click(screen.getByRole('option', { name: '全部分类' }))
    expect(screen.getByRole('combobox', { name: '按设备筛选指标' })).toHaveTextContent('全部设备')
    expect(screen.getByRole('combobox', { name: '按指标分类筛选' })).toHaveTextContent('全部分类')
  })

  it('勾选 <= 6 条渲染多指标同图对比与归一化切换，超过 6 条给出友好上限提示', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <LatestDataTab
        activeGroupId={null}
        selectedDeviceIds={[]}
        onSelectHost={jest.fn()}
      />
    )

    expect(await screen.findByText('CPU 使用率-1')).toBeInTheDocument()

    for (let i = 1; i <= 6; i++) {
      await user.click(
        screen.getByRole('checkbox', { name: `选择对比 SW-0${i} CPU 使用率-${i}` })
      )
    }

    expect(await screen.findByLabelText('多指标同图对比曲线图')).toBeInTheDocument()
    expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()

    // 切换归一化 0~100%
    await user.click(screen.getByRole('button', { name: '归一化 0~100%' }))
    expect(screen.getByRole('button', { name: '归一化 0~100%' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // 尝试勾选第 7 条触发上限提示
    await user.click(
      screen.getByRole('checkbox', { name: '选择对比 SW-07 CPU 使用率-7' })
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '最多支持同时对比 6 条指标序列'
    )
    expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()
  })

  it('StrictMode + Toaster 下勾选超过 6 条指标零 console.error 报错，取消/移除后可继续勾选', async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeMetricItem),
      total: 9,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    try {
      render(
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <LatestDataTab
              activeGroupId={null}
              selectedDeviceIds={[]}
              onSelectHost={jest.fn()}
            />
            <Toaster />
          </QueryClientProvider>
        </React.StrictMode>
      )

      expect(await screen.findByText('CPU 使用率-9')).toBeInTheDocument()

      for (let i = 1; i <= 6; i++) {
        await user.click(
          screen.getByRole('checkbox', { name: `选择对比 SW-0${i} CPU 使用率-${i}` })
        )
      }

      expect(await screen.findByLabelText('多指标同图对比曲线图')).toBeInTheDocument()
      expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()
      expect(screen.getByText('已勾选对比 6/6')).toBeInTheDocument()

      // 点击第 7 个指标触发上限提示与 toast.error
      await user.click(
        screen.getByRole('checkbox', { name: '选择对比 SW-07 CPU 使用率-7' })
      )

      expect(screen.getByRole('alert')).toHaveTextContent(
        '最多支持同时对比 6 条指标序列，请先取消已选指标'
      )
      expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()
      expect(screen.getByText('已勾选对比 6/6')).toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: '选择对比 SW-07 CPU 使用率-7' })
      ).not.toBeChecked()

      // 点击移除按钮移除第 2 条指标后，上限提示消失，可正常勾选第 8 条作为新的第 6 条
      await user.click(
        screen.getByRole('button', { name: '移除对比 SW-02 · CPU 使用率-2' })
      )

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('多指标同图对比（5/6）')).toBeInTheDocument()
      expect(screen.getByText('已勾选对比 5/6')).toBeInTheDocument()

      await user.click(
        screen.getByRole('checkbox', { name: '选择对比 SW-08 CPU 使用率-8' })
      )

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()
      expect(screen.getByText('已勾选对比 6/6')).toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: '选择对比 SW-08 CPU 使用率-8' })
      ).toBeChecked()

      // 再次触发上限后通过取消勾选第 1 条解除上限，并可勾选第 9 条
      await user.click(
        screen.getByRole('checkbox', { name: '选择对比 SW-07 CPU 使用率-7' })
      )
      expect(screen.getByRole('alert')).toHaveTextContent(
        '最多支持同时对比 6 条指标序列，请先取消已选指标'
      )

      await user.click(
        screen.getByRole('checkbox', { name: '选择对比 SW-01 CPU 使用率-1' })
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('多指标同图对比（5/6）')).toBeInTheDocument()

      await user.click(
        screen.getByRole('checkbox', { name: '选择对比 SW-09 CPU 使用率-9' })
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('多指标同图对比（6/6）')).toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: '选择对比 SW-09 CPU 使用率-9' })
      ).toBeChecked()

      expect(consoleErrorSpy).not.toHaveBeenCalled()
    } finally {
      toast.remove()
      consoleErrorSpy.mockRestore()
    }
  })

  it('独立端口列、去 item_key、屏蔽非流量端口、自然排序与对比图去 ifX', async () => {
    const user = userEvent.setup()
    const collectedAt = '2026-11-20T12:15:30Z'

    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'if10',
          interface_display_name: 'GigabitEthernet0/0/10',
          item_key: 'if.in.bps',
          application_tag: 'interface',
          metric_value: 2048,
          prev_value: 1024,
          delta: 1024,
          delta_display: '+1.00 KB',
          display_value: '2.00 KB',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'if48',
          interface_display_name: 'GigabitEthernet0/0/48',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 4096,
          prev_value: 4096,
          delta: 0,
          delta_display: '无变化',
          display_value: '4.00 KB',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'Console9/0/0',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 0,
          prev_value: 0,
          delta: 0,
          delta_display: '无变化',
          display_value: '0 B',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'InLoopBack0',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 0,
          prev_value: 0,
          delta: 0,
          delta_display: '无变化',
          display_value: '0 B',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'MEth0/0/1',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 0,
          prev_value: 0,
          delta: 0,
          delta_display: '无变化',
          display_value: '0 B',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'if2',
          interface_display_name: 'GigabitEthernet0/0/2',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 1024,
          prev_value: 1024,
          delta: 0,
          delta_display: '无变化',
          display_value: '1.00 KB',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'if1',
          interface_display_name: 'GigabitEthernet0/0/1',
          item_key: 'ifHCInOctets',
          application_tag: 'interface',
          metric_value: 512,
          prev_value: 256,
          delta: 256,
          delta_display: '+256 B',
          display_value: '512 B',
          is_abnormal: false,
          collected_at: collectedAt,
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'icmp.rtt',
          metric_label: 'ICMP 探测延迟',
          interface_name: '',
          item_key: 'icmp.rtt',
          application_tag: 'availability',
          metric_value: 1.5,
          prev_value: 1.0,
          delta: 0.5,
          delta_display: '+0.5 ms',
          display_value: '1.5 ms',
          is_abnormal: false,
          collected_at: collectedAt,
        },
      ],
      total: 5,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    ;(getAdhocGraphs as jest.Mock).mockResolvedValue({
      timestamps: ['2026-11-20T12:00:00Z', '2026-11-20T12:05:00Z'],
      start_time: '2026-11-20T11:15:00Z',
      end_time: '2026-11-20T12:15:00Z',
      series: [
        {
          key: '31:ifHCInOctets:if1',
          device_id: 31,
          device_name: 'SW-01',
          metric_name: 'ifHCInOctets',
          metric_label: '入站累计字节数',
          interface_name: 'if1',
          interface_display_name: 'GigabitEthernet0/0/1',
          unit: 'B',
          values: [256, 512],
        },
      ],
    })

    const { container } = renderWithQuery(
      <LatestDataTab
        activeGroupId={null}
        selectedDeviceIds={[]}
        onSelectHost={jest.fn()}
      />
    )

    expect(await screen.findByText('ICMP 探测延迟')).toBeInTheDocument()

    // 1. 不再渲染 item_key 副行
    expect(container.textContent).not.toContain('icmp.rtt')
    expect(container.textContent).not.toContain('if.in.bps')
    expect(container.textContent).not.toContain('ifHCInOctets')

    // 2. 过滤非流量端口
    expect(container.textContent).not.toContain('Console9/0/0')
    expect(container.textContent).not.toContain('InLoopBack0')
    expect(container.textContent).not.toContain('MEth0/0/1')

    // 3. 独立端口列展示「整机」与真实端口名（无 ifX），且按 整机 -> 1 -> 2 -> 10 -> 48 自然序排列
    expect(screen.getByRole('columnheader', { name: '端口' })).toBeInTheDocument()
    const bodyRows = Array.from(container.querySelectorAll('tbody tr'))
    const portOrder = bodyRows.map((tr) => tr.querySelectorAll('td')[3]?.textContent?.trim())
    expect(portOrder).toEqual([
      '整机',
      'GigabitEthernet0/0/1',
      'GigabitEthernet0/0/2',
      'GigabitEthernet0/0/10',
      'GigabitEthernet0/0/48',
    ])
    expect(container.textContent).not.toMatch(/\bif(?:1|2|10|48)\b/i)

    // 4. 勾选 if1 行对比时，图例与 formatSeriesDisplayName 展示真实端口名而非 if1
    const checkboxes = screen.getAllByRole('checkbox', { name: /选择对比 SW-01 入站累计字节数/ })
    await user.click(checkboxes[0])
    expect(await screen.findByLabelText('多指标同图对比曲线图')).toBeInTheDocument()
    expect(
      screen.getByText('SW-01 · 入站累计字节数 (GigabitEthernet0/0/1)')
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bif1\b/i)

    expect(
      formatSeriesDisplayName({
        key: '31:ifHCInOctets:if1',
        device_id: 31,
        device_name: 'SW-01',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if1',
        interface_display_name: 'GigabitEthernet0/0/1',
        values: [256, 512],
      })
    ).toBe('SW-01 · 入站累计字节数 (GigabitEthernet0/0/1)')

    expect(
      formatSeriesDisplayName({
        key: '31:ifHCInOctets:if9',
        device_id: 31,
        device_name: 'SW-01',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if9',
        values: [256, 512],
      })
    ).toBe('SW-01 · 入站累计字节数')

    // 5. 多设备场景：整机始终置顶，再按 device_id 升序、端口自然序排列，不跨设备交错
    const multiDeviceSorted = [
      { device_id: 2, interface_name: 'if1', interface_display_name: 'GigabitEthernet0/0/1', metric_name: 'ifHCInOctets' },
      { device_id: 1, interface_name: 'if10', interface_display_name: 'GigabitEthernet0/0/10', metric_name: 'ifHCInOctets' },
      { device_id: 2, interface_name: '', metric_name: 'cpu_usage' },
      { device_id: 1, interface_name: 'if2', interface_display_name: 'GigabitEthernet0/0/2', metric_name: 'ifHCInOctets' },
      { device_id: 1, interface_name: '', metric_name: 'icmp.rtt' },
    ].sort(compareLatestDataItemsNaturally)

    expect(multiDeviceSorted.map((x) => `${x.device_id}:${x.interface_display_name ?? (x.interface_name || 'host')}`)).toEqual([
      '1:host',
      '2:host',
      '1:GigabitEthernet0/0/2',
      '1:GigabitEthernet0/0/10',
      '2:GigabitEthernet0/0/1',
    ])
  })

  it('整机出入方向速率展示同源口径提示，且 buildLatestDataQueryKey 归一化设备顺序产出一致缓存键', async () => {
    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'bandwidth_in',
          metric_label: '下行速率',
          interface_name: '',
          item_key: 'bandwidth_in',
          application_tag: 'network',
          metric_value: 2000,
          prev_value: 1500,
          delta: 500,
          delta_display: '+500 bps',
          display_value: '2 Kbps',
          is_abnormal: false,
          collected_at: '2026-11-20T12:15:00Z',
        },
        {
          device_id: 31,
          device_name: 'SW-01',
          ip_address: '10.30.0.1',
          metric_name: 'bandwidth_out',
          metric_label: '上行速率',
          interface_name: '',
          item_key: 'bandwidth_out',
          application_tag: 'network',
          metric_value: 1000,
          prev_value: 1000,
          delta: 0,
          delta_display: '无变化',
          display_value: '1 Kbps',
          is_abnormal: false,
          collected_at: '2026-11-20T12:15:00Z',
        },
      ],
      total: 2,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    renderWithQuery(
      <LatestDataTab
        activeGroupId={null}
        selectedDeviceIds={[]}
        onSelectHost={jest.fn()}
      />
    )

    expect(await screen.findByText('下行速率')).toHaveAttribute(
      'title',
      '整机所有物理接口入方向总流量（与总览流量监控同源，已剔除逻辑口与聚合口）'
    )
    expect(screen.getByText('上行速率')).toHaveAttribute(
      'title',
      '整机所有物理接口出方向总流量（与总览流量监控同源，已剔除逻辑口与聚合口）'
    )

    expect(
      buildLatestDataQueryKey({ deviceIds: [7, 6], page: 1, pageSize: 50 })
    ).toEqual(
      buildLatestDataQueryKey({ deviceIds: [6, 7], groupId: 0, page: 1, pageSize: 50 })
    )
  })
})
