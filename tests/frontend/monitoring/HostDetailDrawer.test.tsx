import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostDetailDrawer } from '@/features/monitoring/components/hosts'
import {
  LATEST_DATA_QUERY_KEY,
  buildLatestDataQueryKey,
} from '@/features/monitoring/components/latest/latestDataHelpers'
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
import { Permission } from '@/lib/types/auth.types'
import { formatDateTimeMDHMS } from '@/utils/formatters'
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
  patch_version: 'V200R024SPH010',
  serial_number: 'SN20261120001',
  location: 'A机房-R01',
  topology_role: 'core',
  topology_role_source: 'inferred',
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
      '/devices?deviceId=21&action=edit&section=credentials&from=monitoring'
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

    // 1. 运行概览：巡检、拓扑角色中文同步、软件版本/补丁版本标签与邻居下钻
    expect(await screen.findByText('健康分 91.5')).toBeInTheDocument()
    expect(screen.getByText('软件版本：')).toBeInTheDocument()
    expect(screen.getByText('补丁版本：')).toBeInTheDocument()
    expect(screen.getByText('VRP 8.210')).toBeInTheDocument()
    expect(screen.getByText('V200R024SPH010')).toBeInTheDocument()
    expect(screen.queryByText('固件版本：')).not.toBeInTheDocument()
    expect(screen.getByText('核心')).toBeInTheDocument()
    expect(screen.getByText('（按拓扑推断）')).toBeInTheDocument()
    expect(screen.queryByText('core')).not.toBeInTheDocument()
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

  it('仅拥有 devices:read 权限时降级渲染「查看设备配置」链接；无设备权限时隐藏链接', async () => {
    ;(usePermission as jest.Mock).mockImplementation(
      (perm: Permission) => perm === Permission.DEVICES_READ
    )

    const { unmount } = renderWithQuery(
      <HostDetailDrawer deviceId={21} onClose={jest.fn()} />
    )
    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()

    expect(
      screen.queryByRole('link', { name: /去设备管理编辑凭据/ })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看设备配置/ })).toHaveAttribute(
      'href',
      '/devices?deviceId=21&from=monitoring'
    )

    unmount()

    ;(usePermission as jest.Mock).mockReturnValue(false)
    renderWithQuery(<HostDetailDrawer deviceId={21} onClose={jest.fn()} />)
    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()

    expect(
      screen.queryByRole('link', { name: /去设备管理编辑凭据/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /查看设备配置/ })
    ).not.toBeInTheDocument()
  })

  it('真机 ifX 合成键场景：隐藏 ifX、仅展示真实端口名与描述、无描述不重复端口名且点击仍用 ifX 查流量', async () => {
    const user = userEvent.setup()
    const ifxDetail: HostDetailResponse = {
      ...mockDetail,
      interfaces: [
        {
          id: 201,
          name: 'if8',
          alias: 'GigabitEthernet0/0/3',
          display_name: 'GigabitEthernet0/0/3',
          description: 'To-Core-SW',
          speed: 1000,
          is_up: true,
          admin_up: true,
          duplex_status: 'full',
          in_errors: 0,
          out_errors: 0,
          in_discards: 0,
          out_discards: 0,
          in_error_rate: 0,
          out_error_rate: 0,
          utilization_in: 12.5,
          utilization_out: 8.3,
          speed_unknown: false,
          flap_count_1h: 0,
          lld_monitored: true,
        },
        {
          id: 202,
          name: 'if9',
          alias: 'GigabitEthernet0/0/4',
          display_name: 'GigabitEthernet0/0/4',
          speed: 1000,
          is_up: true,
          admin_up: true,
          duplex_status: 'full',
          in_errors: 0,
          out_errors: 0,
          in_discards: 0,
          out_discards: 0,
          in_error_rate: 0,
          out_error_rate: 0,
          utilization_in: 5.0,
          utilization_out: 4.0,
          speed_unknown: false,
          flap_count_1h: 0,
          lld_monitored: true,
        },
        {
          id: 203,
          name: 'if10',
          speed: 0,
          is_up: false,
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
          lld_monitored: true,
        },
      ],
    }

    ;(getMonitoringHostDetail as jest.Mock).mockResolvedValue(ifxDetail)
    ;(fetchDeviceInterfaceTraffic as jest.Mock).mockResolvedValue({
      deviceId: 21,
      interface: 'if8',
      interfaces: [{ name: 'if8', label: 'GigabitEthernet0/0/3' }],
      points: [
        { timestamp: '2026-11-20T12:00:00Z', inbound: 120, outbound: 80 },
      ],
    })

    const { container } = renderWithQuery(
      <HostDetailDrawer deviceId={21} onClose={jest.fn()} />
    )
    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '端口监控' }))

    // 端口 1：展示真实端口名与描述
    expect(screen.getByText('GigabitEthernet0/0/3')).toBeInTheDocument()
    expect(screen.getByText('To-Core-SW')).toBeInTheDocument()

    // 端口 2：无描述，端口名不重复渲染为副行描述
    expect(screen.getAllByText('GigabitEthernet0/0/4')).toHaveLength(1)

    // 端口 3：仅合成键 if10 且无 display_name/alias，主行展示 '—'
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4) // 1 表头 + 3 端口行
    expect(rows[3].querySelector('td')).toHaveTextContent('—')

    // 页面绝不出现 if8 / if9 / if10
    expect(container.textContent).not.toMatch(/\bif(?:8|9|10)\b/i)

    // 点击端口 1 行，仍以 interfaceName: 'if8' 请求流量趋势，且趋势图标题显示真实端口名而非 if8
    await user.click(screen.getByText('GigabitEthernet0/0/3'))
    await waitFor(() => {
      expect(fetchDeviceInterfaceTraffic).toHaveBeenCalledWith(21, '1h', 'if8')
    })

    const chartHeading = await screen.findByRole('heading', {
      name: /端口双轨观测：GigabitEthernet0\/0\/3/,
    })
    expect(chartHeading).toHaveTextContent('端口双轨观测：GigabitEthernet0/0/3 · To-Core-SW')
    expect(container.textContent).not.toMatch(/\bif(?:8|9|10)\b/i)
  })

  it('硬件与链路：光模块 uW/uA/mV 换算、过滤全 0 占位行与华为组件名/状态兼容', async () => {
    const user = userEvent.setup()
    const hwDetail: HostDetailResponse = {
      ...mockDetail,
      snmp_extensions: {
        device_id: 21,
        optical_transceivers: [
          {
            index: '939982848',
            name: 'GigabitEthernet0/0/25',
            rx_power: 5,
            rx_power_unit: 'uW',
            tx_power: 500,
            tx_power_unit: 'uW',
            bias_current: 12000,
            bias_current_unit: 'uA',
            voltage: 3300,
            voltage_unit: 'mV',
          },
          {
            index: '939982849',
            rx_power: 0,
            rx_power_unit: 'uW',
            tx_power: 0,
            tx_power_unit: 'uW',
            bias_current: 0,
            bias_current_unit: 'uA',
            voltage: 0,
            voltage_unit: 'mV',
          },
          {
            index: '939982850',
            rx_power: -5,
            rx_power_unit: 'dBm',
            tx_power: -2,
            tx_power_unit: 'dBm',
          },
        ],
        components: [
          {
            index: '201326593',
            kind: 'board',
            name: 'MPU Board 0',
            state: 3,
            status_label: '正常',
            status_level: 'normal',
          },
          {
            index: '0.3',
            kind: 'fan',
            state: 2,
          },
          {
            index: '335544321',
            kind: 'board',
            state: 3,
          },
        ],
        bgp_peers: [],
        disks: [],
      },
    }

    ;(getMonitoringHostDetail as jest.Mock).mockResolvedValue(hwDetail)

    const { container } = renderWithQuery(
      <HostDetailDrawer deviceId={21} onClose={jest.fn()} />
    )
    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '硬件与链路' }))

    // 光模块：在位真实端口名、uW -> dBm 换算与弱光告警、历史无名有效光口降级为 光口 #2
    expect(screen.getByText('光口名称')).toBeInTheDocument()
    expect(screen.getByText('GigabitEthernet0/0/25')).toBeInTheDocument()
    expect(screen.getByText('-23.01 dBm')).toBeInTheDocument()
    expect(screen.getByText('12.0 mA / 3.30 V')).toBeInTheDocument()
    expect(screen.getByText('弱光告警')).toBeInTheDocument()
    expect(screen.getByText('光口 #2')).toBeInTheDocument()
    expect(container.textContent).not.toContain('939982849')

    // 风扇 / 电源 / 单板健康状态：真实名称、槽位格式化、entPhysicalIndex 降级与 board state=3 兼容
    const mpuCard = screen.getByText('MPU Board 0').closest('div')?.parentElement
    const fanCard = screen.getByText('槽位 0 · 风扇 3').closest('div')?.parentElement
    const board2Card = screen.getByText('单板 2').closest('div')?.parentElement
    expect(mpuCard).toHaveTextContent('正常')
    expect(fanCard).toHaveTextContent('异常')
    expect(board2Card).toHaveTextContent('正常')
    expect(container.textContent).not.toContain('335544321')
    expect(container.textContent).not.toContain('异常 (3)')
  })

  it('实时指标 5 列优化：仅中文指标名、屏蔽非流量端口、自然排序、真实端口名与整机胶囊、delta_display 语义化、含秒时间、视角切换与分页', async () => {
    const user = userEvent.setup()
    const collectedAt = '2026-11-20T12:15:30Z'
    const page1Items = [
      // 故意乱序输入：先放 10 / 2 / 24 号端口与非流量端口，再放整机与 1 / 3 号端口
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if10',
        interface_display_name: 'GigabitEthernet0/0/10',
        item_key: 'ifHCInOctets',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if11',
        interface_display_name: 'Console9/0/0',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'MEth0/0/1',
        item_key: 'ifHCInOctets',
        application_tag: 'interface',
        metric_value: 100,
        prev_value: 100,
        delta: 0,
        delta_display: '无变化',
        display_value: '100 B',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'NULL0',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if2',
        interface_display_name: 'GigabitEthernet0/0/2',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if24',
        interface_display_name: 'GigabitEthernet0/0/24',
        item_key: 'ifHCInOctets',
        application_tag: 'interface',
        metric_value: 8192,
        prev_value: 8192,
        delta: 0,
        delta_display: '无变化',
        display_value: '8.00 KB',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if1',
        interface_display_name: 'GigabitEthernet0/0/1',
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
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'bandwidth_in',
        metric_label: '下行速率',
        interface_name: '',
        interface_display_name: '',
        item_key: 'bandwidth.in',
        application_tag: 'interface',
        metric_value: 1450,
        prev_value: 340,
        delta: 1110,
        delta_display: '+1.11 Kbps',
        display_value: '1.45 Kbps',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'icmp.rtt',
        metric_label: 'ICMP 探测延迟',
        interface_name: '',
        item_key: 'icmp.rtt',
        application_tag: 'availability',
        metric_value: 2.3,
        prev_value: 2.0,
        delta: 0.3,
        delta_display: '+0.3 ms',
        display_value: '2.3 ms',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCInOctets',
        metric_label: '入站累计字节数',
        interface_name: 'if8',
        interface_display_name: 'GigabitEthernet0/0/3',
        item_key: 'ifHCInOctets',
        application_tag: 'interface',
        metric_value: 12400000,
        prev_value: 12400000,
        delta: 0,
        delta_display: '无变化',
        display_value: '12.4 MB',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'ifHCOutOctets',
        metric_label: '出站累计字节数',
        interface_name: 'if9',
        item_key: 'ifHCOutOctets',
        application_tag: 'interface',
        metric_value: 8000,
        prev_value: 7000,
        delta: 1000,
        delta_display: '+1.00 KB',
        display_value: '8.00 KB',
        is_abnormal: false,
        collected_at: collectedAt,
      },
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'cpu_usage',
        metric_label: 'CPU 使用率',
        interface_name: '',
        item_key: 'cpu.usage',
        application_tag: 'system',
        metric_value: 72.5,
        prev_value: 69.0,
        delta: 3.5,
        metric_unit: '%',
        display_value: '72.50 %',
        is_abnormal: false,
        collected_at: collectedAt,
      },
    ]

    const page2Items = [
      {
        device_id: 21,
        device_name: 'Core-Router-21',
        ip_address: '10.20.0.21',
        metric_name: 'memory_usage',
        metric_label: '内存使用率',
        interface_name: '',
        item_key: 'memory.usage',
        application_tag: 'system',
        metric_value: 61.0,
        prev_value: 60.0,
        delta: 1.0,
        delta_display: '+1.00 %',
        display_value: '61.00 %',
        is_abnormal: false,
        collected_at: collectedAt,
      },
    ]

    ;(getLatestData as jest.Mock)
      .mockResolvedValueOnce({
        items: page1Items,
        total: 80,
        page: 1,
        page_size: 50,
        total_pages: 2,
      })
      .mockResolvedValueOnce({
        items: page2Items,
        total: 80,
        page: 2,
        page_size: 50,
        total_pages: 2,
      })

    const { container } = renderWithQuery(
      <HostDetailDrawer deviceId={21} onClose={jest.fn()} />
    )
    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '实时指标' }))
    expect(await screen.findByText('下行速率')).toBeInTheDocument()

    // 1. 指标名称列仅显示中文名称，DOM 绝不出现 item_key
    expect(screen.getByText('ICMP 探测延迟')).toBeInTheDocument()
    expect(screen.getByText('下行速率')).toBeInTheDocument()
    expect(screen.getAllByText('入站累计字节数').length).toBeGreaterThanOrEqual(1)
    expect(container.textContent).not.toContain('icmp.rtt')
    expect(container.textContent).not.toContain('bandwidth.in')
    expect(container.textContent).not.toContain('ifHCInOctets')
    expect(container.textContent).not.toContain('ifHCOutOctets')
    expect(container.textContent).not.toContain('cpu.usage')

    // 2. 非流量端口全部屏蔽
    expect(container.textContent).not.toContain('Console9/0/0')
    expect(container.textContent).not.toContain('InLoopBack0')
    expect(container.textContent).not.toContain('MEth0/0/1')
    expect(container.textContent).not.toContain('NULL0')

    // 3. 整机置顶 + 端口自然排序（1 -> 2 -> 3 -> 10 -> 24）
    const bodyRows = Array.from(container.querySelectorAll('tbody tr'))
    const portOrder = bodyRows.map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim())
    expect(portOrder).toEqual([
      '整机',
      '整机',
      '整机',
      'GigabitEthernet0/0/1',
      'GigabitEthernet0/0/2',
      'GigabitEthernet0/0/3',
      'GigabitEthernet0/0/10',
      'GigabitEthernet0/0/24',
      '—',
    ])

    // 4. 整机与端口关键列值断言 + DOM 绝不出现 ifX
    expect(screen.getByText('共 80 项实时指标')).toBeInTheDocument()
    expect(screen.getByText('1.45 Kbps')).toBeInTheDocument()
    expect(screen.getByText('+1.11 Kbps')).toBeInTheDocument()
    const expectedTime = formatDateTimeMDHMS(collectedAt)
    expect(expectedTime).toMatch(/^\d{2}-\d{2}\s+\d{2}:\d{2}:30$/)
    expect(screen.getAllByText(expectedTime).length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('12.4 MB')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bif(?:1|2|8|9|10|11|24)\b/i)

    // 5. delta_display 缺失时回退 formatMetricDelta（'+3.50 %'）
    expect(screen.getByText('+3.50 %')).toBeInTheDocument()

    // 6. 视角切换：「整机」/「端口」/「全部」
    await user.click(screen.getByRole('button', { name: '端口' }))
    expect(screen.queryByText('下行速率')).not.toBeInTheDocument()
    expect(screen.getByText('GigabitEthernet0/0/3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '整机' }))
    expect(screen.getByText('下行速率')).toBeInTheDocument()
    expect(screen.queryByText('GigabitEthernet0/0/3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText('GigabitEthernet0/0/3')).toBeInTheDocument()

    // 7. 分页控件：点击「下一页」请求 page: 2
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(getLatestData).toHaveBeenLastCalledWith({
        device_ids: [21],
        page: 2,
        page_size: 50,
      })
    })
    expect(await screen.findByText('内存使用率')).toBeInTheDocument()
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
  })

  it('抽屉实时指标与实时指标明细共享缓存键，立即采集成功后同步失效并刷新实时指标', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    ;(triggerDeviceCollectNow as jest.Mock).mockResolvedValueOnce({
      success: true,
      device_id: 21,
      metrics_written: 12,
      interfaces_written: 4,
      collection_time_ms: 180,
    })

    ;(getLatestData as jest.Mock)
      .mockResolvedValueOnce({
        items: [
          {
            device_id: 21,
            device_name: 'Core-Router-21',
            ip_address: '10.20.0.21',
            metric_name: 'bandwidth_in',
            metric_label: '下行速率',
            interface_name: '',
            item_key: 'bandwidth_in',
            application_tag: 'network',
            metric_value: 1000,
            prev_value: 900,
            delta: 100,
            delta_display: '+100 bps',
            display_value: '1 Kbps',
            is_abnormal: false,
            collected_at: '2026-11-20T12:10:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            device_id: 21,
            device_name: 'Core-Router-21',
            ip_address: '10.20.0.21',
            metric_name: 'bandwidth_in',
            metric_label: '下行速率',
            interface_name: '',
            item_key: 'bandwidth_in',
            application_tag: 'network',
            metric_value: 2048,
            prev_value: 1000,
            delta: 1048,
            delta_display: '+1.05 Kbps',
            display_value: '2.05 Kbps',
            is_abnormal: false,
            collected_at: '2026-11-20T12:15:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      })

    render(
      <QueryClientProvider client={queryClient}>
        <HostDetailDrawer deviceId={21} onClose={jest.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Core-Router-21')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '实时指标' }))
    expect(await screen.findByText('1 Kbps')).toBeInTheDocument()
    expect(screen.getByText('下行速率')).toHaveAttribute(
      'title',
      '整机所有物理接口入方向总流量（与总览流量监控同源，已剔除逻辑口与聚合口）'
    )

    // 抽屉内实时指标写入的缓存键与实时指标明细页完全一致
    const sharedKey = buildLatestDataQueryKey({
      deviceIds: [21],
      groupId: null,
      applicationTag: '',
      search: '',
      onlyAbnormalOrChanged: false,
      page: 1,
      pageSize: 50,
    })
    expect(queryClient.getQueryData(sharedKey)).toBeDefined()

    // 触发「立即采集一次」后失效实时指标与相关监控缓存，并自动拉取最新快照
    await user.click(screen.getByRole('button', { name: '立即采集一次' }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [LATEST_DATA_QUERY_KEY] })
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-host-detail', 21] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-hosts'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-topn'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-interface-traffic'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-v2'] })
    expect(await screen.findByText('2.05 Kbps')).toBeInTheDocument()
  })
})
