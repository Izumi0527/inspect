import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostDetailDrawer } from '@/features/monitoring/components/hosts'
import {
  CollectCooldownError,
  getLatestData,
  getMonitoringHostDetail,
  triggerDeviceCollectNow,
} from '@/features/monitoring/api/monitoring-hosts.api'
import {
  acknowledgeAlert,
  snoozeAlert,
} from '@/features/monitoring/api/monitoring-config.api'
import { fetchDeviceInterfaceTraffic } from '@/features/monitoring/api/monitoring.api'
import { usePermission } from '@/lib/contexts/auth-context'
import type { HostDetailResponse } from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => {
  const actual = jest.requireActual('@/features/monitoring/api/monitoring-hosts.api')
  return {
    ...actual,
    getMonitoringHostDetail: jest.fn(),
    triggerDeviceCollectNow: jest.fn(),
    getLatestData: jest.fn(),
  }
})

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  acknowledgeAlert: jest.fn(),
  snoozeAlert: jest.fn(),
  unsnoozeAlert: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring.api', () => ({
  fetchDeviceInterfaceTraffic: jest.fn(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  usePermission: jest.fn(),
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

const mockDetail: HostDetailResponse = {
  device: {
    id: 21,
    name: 'Core-Router-21',
    ip_address: '10.20.0.21',
    hostname: 'core-rtr-21',
    device_type: 'router',
    vendor: 'huawei',
    model: 'NE40E',
    group_id: 1,
    group_name: '骨干网络',
    status: 'warning',
    is_monitored: true,
    is_pinned: true,
    in_maintenance: false,
    cpu_usage: 65.4,
    memory_usage: 58.2,
    temperature: 48.5,
    uptime: 90000,
    response_time: 1.8,
    protocols: {
      icmp_status: 'online',
      snmp_status: 'success',
      cli_protocol: 'ssh',
      icmp_healthy: true,
      snmp_healthy: true,
      cli_configured: true,
    },
    collection_state: {
      last_error_code: '',
      last_error_message: '',
      consecutive_failures: 0,
      in_backoff: false,
      last_duration_ms: 95,
    },
    interfaces_up: 1,
    interfaces_total: 2,
    hardware_fault_count: 0,
    sparkline: [],
  },
  firmware_version: 'VRP 8.210',
  serial_number: 'SN20261120001',
  location: 'A机房-R01',
  topology_role: 'core',
  interfaces: [
    {
      id: 101,
      name: 'GigabitEthernet0/0/1',
      alias: 'Uplink-Core',
      speed: 1000,
      is_up: true,
      admin_up: true,
      duplex_status: 'full',
      in_errors: 12,
      out_errors: 0,
      in_discards: 2,
      out_discards: 0,
      in_error_rate: 0.1,
      out_error_rate: 0,
      utilization_in: 42.5,
      utilization_out: 31.2,
      speed_unknown: false,
      flap_count_1h: 3,
      lld_monitored: true,
    },
    {
      id: 102,
      name: 'LoopBack0',
      speed: 0,
      is_up: true,
      admin_up: true,
      duplex_status: 'unknown',
      in_errors: 0,
      out_errors: 0,
      in_discards: 0,
      out_discards: 0,
      in_error_rate: 0,
      out_error_rate: 0,
      utilization_in: 0,
      utilization_out: 0,
      speed_unknown: true,
      flap_count_1h: 0,
      lld_monitored: false,
    },
  ],
  snmp_extensions: {
    device_id: 21,
    optical_transceivers: [
      {
        index: 'GE0/0/1',
        tx_power: -2.1,
        tx_power_unit: 'dBm',
        rx_power: -24.8,
        rx_power_unit: 'dBm',
      },
    ],
    components: [{ index: '1', kind: 'fan', state: 1 }],
    bgp_peers: [{ index: '10.20.0.254', state: 6, state_label: 'Established', established_time_seconds: 7200 }],
    poe: { ports: [{ index: '1', consuming_power: 30 }], remaining_power: 170, remaining_unit: 'W' },
    stp: { top_changes: 4, time_since_topology_change: 3600 },
    disks: [],
  },
  latest_inspection: {
    inspection_id: 88,
    status: 'completed',
    score: 91.5,
    total_checks: 20,
    passed_checks: 18,
    failed_checks: 1,
    warning_checks: 1,
    completed_at: '2026-11-20T12:00:00Z',
  },
  neighbors: [
    {
      local_port: 'GE0/0/1',
      remote_device_id: 22,
      remote_name: 'Dist-SW-22',
      remote_port: 'GE0/0/24',
      remote_mgmt_ip: '10.20.0.22',
      collected_at: '2026-11-20T12:00:00Z',
    },
  ],
  recent_logs: [
    {
      id: 1,
      level: 'error',
      source: 'syslog',
      message: 'Interface GE0/0/1 link flap detected',
      log_timestamp: '2026-11-20T12:10:00Z',
    },
  ],
  error_log_count_24h: 2,
  trap_log_count_24h: 1,
  active_alerts: [
    {
      id: 701,
      title: '端口光衰弱光告警',
      severity: 'warning',
      status: 'active',
      current_value: -24.8,
      threshold_value: -20,
    },
  ],
  thresholds: {
    cpu: { warn: 80, crit: 90 },
    memory: { warn: 80, crit: 90 },
    temperature: { warn: 70, crit: 85 },
  },
  limitedByPermission: false,
  permissions: {
    alerts: { allowed: true },
    inspections: { allowed: true },
    logs: { allowed: true },
  },
}

describe('单机 6 视角观测抽屉 HostDetailDrawer (Task 11)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(usePermission as jest.Mock).mockReturnValue(true)
    ;(getMonitoringHostDetail as jest.Mock).mockResolvedValue(mockDetail)
    ;(fetchDeviceInterfaceTraffic as jest.Mock).mockResolvedValue({
      deviceId: 21,
      interface: 'GigabitEthernet0/0/1',
      interfaces: [{ name: 'GigabitEthernet0/0/1', label: 'Uplink-Core' }],
      points: [
        { timestamp: '2026-11-20T12:00:00Z', inbound: 120, outbound: 80 },
        { timestamp: '2026-11-20T12:05:00Z', inbound: 140, outbound: 95 },
      ],
    })
    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [
        {
          device_id: 21,
          device_name: 'Core-Router-21',
          ip_address: '10.20.0.21',
          metric_name: 'cpu_usage',
          metric_label: 'CPU 使用率',
          interface_name: '',
          item_key: 'cpu.usage',
          application_tag: 'system',
          metric_value: 65.4,
          prev_value: 60.0,
          delta: 5.4,
          display_value: '65.40 %',
          is_abnormal: false,
          collected_at: '2026-11-20T12:10:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    ;(acknowledgeAlert as jest.Mock).mockResolvedValue({ success: true })
    ;(snoozeAlert as jest.Mock).mockResolvedValue({
      success: true,
      alert_id: '701',
      snoozed_until: '2026-11-20T20:00:00Z',
      snoozed_by: 'admin',
      snooze_reason: '排查光纤跳线',
    })
  })

  it('支持 Esc 关闭、立即采集(含429冷却)与复制脱敏诊断摘要', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    ;(triggerDeviceCollectNow as jest.Mock).mockRejectedValueOnce(
      new CollectCooldownError('采集冷却中，请 25 秒后再试', 25)
    )

    renderWithQuery(<HostDetailDrawer deviceId={21} onClose={onClose} />)

    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /去设备管理编辑凭据/ })).toHaveAttribute(
      'href',
      '/devices?deviceId=21'
    )

    // 立即采集触发 429 冷却提示
    await user.click(screen.getByRole('button', { name: '立即采集一次' }))
    expect(await screen.findByText(/采集冷却中，请 25 秒后再试/)).toBeInTheDocument()

    // 复制脱敏诊断摘要（不含任何密码字样）
    await user.click(screen.getByRole('button', { name: '复制诊断摘要' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('Core-Router-21')
    expect(copied).toContain('最近巡检：91.5 分')
    expect(copied).not.toMatch(/password|community|private_key/i)

    // Esc 关闭
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('支持 6 大视角切换：巡检/邻居下钻、端口闪断与双轨图、硬件弱光、告警静默与日志权限降级', async () => {
    const user = userEvent.setup()
    const onSelectHost = jest.fn()

    renderWithQuery(
      <HostDetailDrawer deviceId={21} onClose={jest.fn()} onSelectHost={onSelectHost} />
    )

    // 1. 运行概览：巡检与邻居下钻
    expect(await screen.findByText('健康分 91.5')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看完整巡检报告/ })).toHaveAttribute(
      'href',
      '/inspection?device_id=21'
    )
    await user.click(screen.getByRole('button', { name: /Dist-SW-22/ }))
    expect(onSelectHost).toHaveBeenCalledWith(22)

    // 2. 端口监控：speed_unknown、闪断角标、隐藏虚拟端口与双轨图（无总流量）
    await user.click(screen.getByRole('tab', { name: '端口监控' }))
    expect(screen.getByText('闪断 3 次')).toBeInTheDocument()
    expect(screen.getByText('— (速率未知)')).toBeInTheDocument()
    await user.click(screen.getByLabelText('隐藏虚拟/未纳管端口'))
    expect(screen.queryByText('LoopBack0')).not.toBeInTheDocument()

    await user.click(screen.getByText('GigabitEthernet0/0/1'))
    const chartSvg = await screen.findByLabelText('端口上行与下行速率双轨图')
    expect(chartSvg).toBeInTheDocument()
    expect(chartSvg.querySelector('[data-series="outbound"]')).toBeInTheDocument()
    expect(chartSvg.querySelector('[data-series="inbound"]')).toBeInTheDocument()
    expect(chartSvg.querySelector('[data-series="total"]')).not.toBeInTheDocument()

    // 3. 硬件与链路
    await user.click(screen.getByRole('tab', { name: '硬件与链路' }))
    expect(screen.getByText('弱光告警')).toBeInTheDocument()
    expect(screen.getByText('Established')).toBeInTheDocument()
    expect(screen.getByText('PoE 供电预算')).toBeInTheDocument()

    // 4. 实时指标
    await user.click(screen.getByRole('tab', { name: '实时指标' }))
    expect(await screen.findByText('CPU 使用率')).toBeInTheDocument()

    // 5. 活跃告警：静默 8h 与深链
    await user.click(screen.getByRole('tab', { name: '活跃告警' }))
    expect(screen.getByRole('link', { name: /前往告警中心查看全部/ })).toHaveAttribute(
      'href',
      '/alerts?device_id=21'
    )
    await user.click(screen.getByRole('button', { name: '临时静默' }))
    await user.click(screen.getByRole('button', { name: '8h' }))
    await user.type(screen.getByPlaceholderText(/光模块备件/), '排查光纤跳线')
    await user.click(screen.getByRole('button', { name: '静默 8h' }))
    await waitFor(() => {
      expect(snoozeAlert).toHaveBeenCalledWith(701, {
        duration_hours: 8,
        reason: '排查光纤跳线',
      })
    })

    // 6. 关联日志与 Trap
    await user.click(screen.getByRole('tab', { name: '关联日志与 Trap' }))
    expect(screen.getByText('Interface GE0/0/1 link flap detected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /前往日志中心看全部/ })).toHaveAttribute(
      'href',
      '/logs?device_id=21&level=error'
    )
  })

  it('缺少 system:logs 权限时在关联日志页展示优雅降级提示', async () => {
    const user = userEvent.setup()
    ;(getMonitoringHostDetail as jest.Mock).mockResolvedValue({
      ...mockDetail,
      recent_logs: [],
      limitedByPermission: true,
      permissions: {
        alerts: { allowed: true },
        inspections: { allowed: true },
        logs: { allowed: false, limitedByPermission: true, requiredPermission: 'system:logs' },
      },
    })

    renderWithQuery(<HostDetailDrawer deviceId={21} onClose={jest.fn()} />)
    await screen.findByText('Core-Router-21')

    await user.click(screen.getByRole('tab', { name: '关联日志与 Trap' }))
    expect(screen.getByText('暂无关联日志查看权限')).toBeInTheDocument()
  })
})
