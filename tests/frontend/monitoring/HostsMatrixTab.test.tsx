import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostsMatrixTab } from '@/features/monitoring/components/hosts'
import {
  batchPinMonitoringDevices,
  getMonitoringHosts,
  pinMonitoringDevice,
  unpinMonitoringDevice,
} from '@/features/monitoring/api/monitoring-hosts.api'
import { createMonitoringMaintenance } from '@/features/monitoring/api/monitoring-config.api'
import {
  bulkDeviceAction,
  getDeviceGroups,
} from '@/features/devices/api/devices.api'
import { usePermission } from '@/lib/contexts/auth-context'
import type { HostsMatrixResponse } from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/components/ui/select', () =>
  require('./components/helpers/selectMock').createSelectMock()
)

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getMonitoringHosts: jest.fn(),
  pinMonitoringDevice: jest.fn(),
  unpinMonitoringDevice: jest.fn(),
  batchPinMonitoringDevices: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  createMonitoringMaintenance: jest.fn(),
}))

jest.mock('@/features/devices/api/devices.api', () => ({
  DEVICE_GROUPS_QUERY_KEY: ['device-groups'],
  getDeviceGroups: jest.fn(),
  bulkDeviceAction: jest.fn(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: jest.fn(),
}))

jest.mock('@/features/devices/components/DeviceGroupModal', () => ({
  DeviceGroupModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="device-group-modal">分组管理弹窗</div> : null,
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

const mockMatrixResponse: HostsMatrixResponse = {
  items: [
    {
      id: 11,
      name: 'Core-SW-01',
      ip_address: '10.10.0.1',
      device_type: 'switch',
      vendor: 'huawei',
      model: 'CE6857',
      group_id: 2,
      group_name: '核心层',
      status: 'warning',
      is_monitored: true,
      is_pinned: false,
      in_maintenance: true,
      maintenance: {
        maintenance_id: 1,
        name: '夜间割接',
        mode: 'collect_silence',
        schedule_type: 'once',
        timezone: 'Asia/Shanghai',
        start_time: '2026-11-20T12:00:00Z',
        end_time: '2026-11-20T16:00:00Z',
      },
      cpu_usage: 78.5,
      memory_usage: 64.2,
      temperature: 51.0,
      response_time: 2.4,
      protocols: {
        icmp_status: 'online',
        snmp_status: 'failed',
        cli_protocol: 'ssh',
        icmp_healthy: true,
        snmp_healthy: false,
        cli_configured: true,
      },
      collection_state: {
        last_error_code: 'auth_failed',
        last_error_message: 'SNMP 认证失败，请核对团体字或凭据',
        consecutive_failures: 4,
        in_backoff: true,
        backoff_until: '2026-11-20T15:00:00Z',
        last_duration_ms: 120,
      },
      interfaces_up: 22,
      interfaces_total: 24,
      hardware_fault_count: 1,
      latest_inspection_score: 92,
      error_log_count_24h: 3,
      trap_log_count_24h: 1,
      sparkline: [
        { timestamp: '2026-11-20T12:00:00Z', cpu: 62 },
        { timestamp: '2026-11-20T12:05:00Z', cpu: 78.5 },
      ],
    },
    {
      id: 12,
      name: 'Access-SW-02',
      ip_address: '10.10.0.2',
      device_type: 'switch',
      vendor: 'h3c',
      status: 'online',
      is_monitored: true,
      is_pinned: true,
      in_maintenance: false,
      cpu_usage: 21.0,
      memory_usage: 35.0,
      temperature: 38.0,
      response_time: 1.2,
      protocols: {
        icmp_status: 'online',
        snmp_status: 'success',
        cli_protocol: '',
        icmp_healthy: true,
        snmp_healthy: true,
        cli_configured: false,
      },
      collection_state: {
        last_error_code: '',
        last_error_message: '',
        consecutive_failures: 0,
        in_backoff: false,
        last_duration_ms: 85,
      },
      interfaces_up: 10,
      interfaces_total: 24,
      hardware_fault_count: 0,
      latest_inspection_score: 98,
      error_log_count_24h: 0,
      trap_log_count_24h: 0,
      sparkline: [],
    },
  ],
  total: 25,
  page: 1,
  page_size: 20,
  total_pages: 2,
  limitedByPermission: false,
  permissions: {
    alerts: { allowed: true },
    inspections: { allowed: true },
    logs: { allowed: true },
  },
}

describe('设备监控矩阵 HostsMatrixTab (Task 10)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(usePermission as jest.Mock).mockReturnValue(true)
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      {
        id: 1,
        name: '总部数据中心',
        parent_id: null,
        device_count: 15,
        online_count: 14,
        alert_count: 1,
        alerts_limited_by_permission: false,
      },
      {
        id: 2,
        name: '核心层',
        parent_id: 1,
        device_count: 5,
        online_count: 4,
        alert_count: 1,
        alerts_limited_by_permission: false,
      },
    ])
    ;(getMonitoringHosts as jest.Mock).mockResolvedValue(mockMatrixResponse)
    ;(pinMonitoringDevice as jest.Mock).mockResolvedValue({
      success: true,
      device_id: 11,
      pinned: true,
    })
    ;(unpinMonitoringDevice as jest.Mock).mockResolvedValue({
      success: true,
      device_id: 12,
      pinned: false,
    })
    ;(batchPinMonitoringDevices as jest.Mock).mockResolvedValue({
      success: true,
      affected: 2,
    })
    ;(bulkDeviceAction as jest.Mock).mockResolvedValue({
      success: true,
      processed_count: 2,
      failed_count: 0,
      errors: [],
      message: 'ok',
    })
    ;(createMonitoringMaintenance as jest.Mock).mockResolvedValue({ id: 9 })
  })

  it('渲染树形分组、协议诊断 Tooltip、跨页列与行点击下钻', async () => {
    const user = userEvent.setup()
    const onSelectGroup = jest.fn()
    const onSelectHost = jest.fn()

    renderWithQuery(
      <HostsMatrixTab
        activeGroupId={null}
        initialStatusFilter={null}
        onSelectGroup={onSelectGroup}
        onSelectHost={onSelectHost}
      />
    )

    expect(await screen.findByText('Core-SW-01')).toBeInTheDocument()
    expect(screen.getByText('总部数据中心')).toBeInTheDocument()
    expect(screen.getByText('92 分')).toBeInTheDocument()
    expect(screen.getByText('错误 3')).toBeInTheDocument()
    expect(screen.getByText('Trap 1')).toBeInTheDocument()
    expect(screen.getByTitle('夜间割接')).toHaveTextContent('维护中')
    expect(screen.getByText('已自动退避')).toBeInTheDocument()

    // 展开子分组并点击
    await user.click(screen.getByRole('button', { name: '展开 总部数据中心' }))
    await user.click(screen.getByText('核心层'))
    expect(onSelectGroup).toHaveBeenCalledWith(2)

    // 悬浮协议胶囊显示脱敏失败原因
    const snmpBadges = screen.getAllByText('SNMP')
    fireEvent.mouseEnter(snmpBadges[0])
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'SNMP 认证失败，请核对团体字或凭据'
    )

    // 新建分组弹窗
    await user.click(screen.getByRole('button', { name: /\+ 新建分组/ }))
    expect(screen.getByTestId('device-group-modal')).toBeInTheDocument()

    // 点击主机行进入详情抽屉
    await user.click(screen.getByText('Core-SW-01'))
    expect(onSelectHost).toHaveBeenCalledWith(11)
  })

  it('支持状态过滤、星标切换、服务端分页与缺权限降级提示', async () => {
    const user = userEvent.setup()
    ;(getMonitoringHosts as jest.Mock).mockResolvedValue({
      ...mockMatrixResponse,
      limitedByPermission: true,
      permissions: {
        alerts: { allowed: false, limitedByPermission: true },
        inspections: { allowed: false, limitedByPermission: true },
        logs: { allowed: false, limitedByPermission: true },
      },
    })

    renderWithQuery(
      <HostsMatrixTab
        activeGroupId={null}
        initialStatusFilter={null}
        onSelectGroup={jest.fn()}
        onSelectHost={jest.fn()}
      />
    )

    expect(await screen.findByText('Core-SW-01')).toBeInTheDocument()
    expect(screen.getAllByText('无巡检权限').length).toBeGreaterThan(0)
    expect(screen.getAllByText('无日志权限').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '仅看关注' }))
    await waitFor(() => {
      expect(getMonitoringHosts).toHaveBeenLastCalledWith(
        expect.objectContaining({ pinned_only: true, page: 1 })
      )
    })

    await user.click(screen.getByRole('button', { name: '关注 Core-SW-01' }))
    await waitFor(() => {
      expect(pinMonitoringDevice).toHaveBeenCalledWith(11)
    })

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(getMonitoringHosts).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      )
    })
  })

  it('支持多选设备并触发批量移组、批量关注与批量加入计划维护', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <HostsMatrixTab
        activeGroupId={null}
        initialStatusFilter={null}
        onSelectGroup={jest.fn()}
        onSelectHost={jest.fn()}
      />
    )

    expect(await screen.findByText('Core-SW-01')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '选择 Core-SW-01' }))
    await user.click(screen.getByRole('checkbox', { name: '选择 Access-SW-02' }))

    expect(screen.getByText('已选择 2 台设备')).toBeInTheDocument()

    // 批量移入分组
    await user.click(screen.getByRole('button', { name: '批量移入分组' }))
    await user.click(screen.getByRole('combobox', { name: '目标分组' }))
    await user.click(screen.getByRole('option', { name: '总部数据中心 (15)' }))
    await user.click(screen.getByRole('button', { name: '确认移入' }))
    await waitFor(() => {
      expect(bulkDeviceAction).toHaveBeenCalledWith('batch_add_group', {
        device_ids: [11, 12],
        group_id: 1,
      })
    })

    // 重新全选并批量加星标
    await user.click(screen.getByRole('checkbox', { name: '全选当前页设备' }))
    await user.click(screen.getByRole('button', { name: '批量加星标' }))
    await waitFor(() => {
      expect(batchPinMonitoringDevices).toHaveBeenCalledWith('pin', [11, 12])
    })

    // 重新勾选并批量加入计划维护
    await user.click(screen.getByRole('checkbox', { name: '选择 Core-SW-01' }))
    await user.click(screen.getByRole('button', { name: '批量加入计划维护' }))
    await user.click(screen.getByRole('button', { name: '确认开启维护' }))
    await waitFor(() => {
      expect(createMonitoringMaintenance).toHaveBeenCalledWith(
        expect.objectContaining({ device_ids: [11], mode: 'collect_silence' })
      )
    })
  })
})
