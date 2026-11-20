import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast, { Toaster } from 'react-hot-toast'
import { LatestDataTab } from '@/features/monitoring/components/latest'
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
    expect(screen.getByText('cpu.usage.1')).toBeInTheDocument()
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
})
