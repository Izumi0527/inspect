import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonitoringView } from '@/features/monitoring/components/MonitoringView'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'
import { getEngineHealth, getMonitoringTopN } from '@/features/monitoring/api/monitoring-hosts.api'
import { getDeviceGroups } from '@/features/devices/api/devices.api'
import type { MonitoringDataEnvelope } from '@/features/monitoring/types'

const mockReplace = jest.fn()
let mockSearchParamsString = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/monitoring',
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}))

let mockedPermissions: Record<string, boolean> = {}

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (perm: string) => mockedPermissions[perm] ?? true,
}))

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => ({ sidebarOpen: false, toggleSidebar: jest.fn() }),
}))

jest.mock('@/features/dashboard/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">sidebar</div>,
}))

jest.mock('@/features/dashboard/components/DashboardHeader', () => ({
  DashboardHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}))

jest.mock('@/hooks', () => ({
  useInView: () => ({ ref: jest.fn(), inView: true }),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: () => ({ data: [], isLoading: false, error: null }),
}))

jest.mock('@/features/monitoring/hooks/useDeviceInterfaceTraffic', () => ({
  INTERFACE_TRAFFIC_QUERY_KEY: 'monitoring-interface-traffic',
  useDeviceInterfaceTraffic: () => ({
    data: undefined,
    isPending: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getEngineHealth: jest.fn(),
  getMonitoringTopN: jest.fn().mockResolvedValue({ metric: 'cpu', unit: '%', items: [] }),
  getMonitoringHosts: jest.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 1,
    limitedByPermission: false,
    permissions: {
      alerts: { allowed: true },
      inspections: { allowed: true },
      logs: { allowed: true },
    },
  }),
  getMonitoringHostDetail: jest.fn().mockResolvedValue({
    device: {
      id: 99,
      name: 'Core-SW-99',
      ip_address: '10.0.0.99',
      device_type: 'switch',
      vendor: 'huawei',
      status: 'warning',
      is_monitored: true,
      is_pinned: false,
      in_maintenance: false,
      protocols: {
        icmp_status: 'online',
        snmp_status: 'failed',
        cli_protocol: '',
        icmp_healthy: true,
        snmp_healthy: false,
        cli_configured: false,
      },
      collection_state: {
        last_error_code: 'auth_failed',
        last_error_message: 'SNMP 认证失败',
        consecutive_failures: 4,
        in_backoff: true,
        last_duration_ms: 100,
      },
      interfaces_up: 0,
      interfaces_total: 0,
      hardware_fault_count: 0,
      sparkline: [],
    },
    topology_role: 'access',
    interfaces: [],
    snmp_extensions: {
      device_id: 99,
      bgp_peers: [],
      optical_transceivers: [],
      components: [],
      disks: [],
    },
    neighbors: [],
    recent_logs: [],
    active_alerts: [],
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
  }),
  getLatestData: jest.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }),
  getAdhocGraphs: jest.fn().mockResolvedValue({
    timestamps: [],
    start_time: '2026-11-20T09:00:00Z',
    end_time: '2026-11-20T10:00:00Z',
    series: [],
  }),
  triggerDeviceCollectNow: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  listMonitoringTemplates: jest.fn().mockResolvedValue([]),
  listMonitoringTriggers: jest.fn().mockResolvedValue([]),
  listMonitoringMaintenances: jest.fn().mockResolvedValue([]),
  acknowledgeAlert: jest.fn(),
  snoozeAlert: jest.fn(),
  unsnoozeAlert: jest.fn(),
}))

jest.mock('@/features/devices/api/devices.api', () => ({
  DEVICE_GROUPS_QUERY_KEY: ['device-groups'],
  getDeviceGroups: jest.fn(),
}))

jest.mock('@/features/monitoring/components/charts', () => ({
  SystemPerformanceChartWrapper: () => <div>SystemPerformanceChartWrapper</div>,
  TemperatureChartWrapper: () => <div>TemperatureChartWrapper</div>,
  InterfaceTrafficChartWrapper: () => <div>InterfaceTrafficChartWrapper</div>,
  TrafficSeriesLegend: () => <ul aria-label="流量序列图例" />,
  ChartSkeleton: () => <div>ChartSkeleton</div>,
}))

jest.mock('@/features/monitoring/components/ReportExportButton', () => ({
  ReportExportButton: () => <div>ReportExportButton</div>,
}))

const buildEnvelope = (): MonitoringDataEnvelope => ({
  data: {
    statsV2: [{ id: 'total_devices', title: '总设备', value: '12' }],
    systemPerformance: [
      { timestamp: '2026-11-20T10:00:00Z', devices: { 'SW-01': { cpu: 30, memory: 45 } } },
    ],
    temperatureHistory: [
      { timestamp: '2026-11-20T10:00:00Z', devices: { 'SW-01': 48 } },
    ],
    networkTrafficHistory: [],
    thresholds: {
      cpu: { warn: 80, crit: 90 },
      memory: { warn: 80, crit: 90 },
      temperature: { warn: 70, crit: 85 },
    },
    healthDistribution: {
      normal: 8,
      elevated: 2,
      overloaded: 1,
      offline: 1,
      maintenance: 0,
    },
    activeProblems: [],
    lastUpdate: '2026-11-20T10:00:00Z',
  },
  sections: {
    stats: { ok: true },
    systemPerformance: { ok: true },
    temperature: { ok: true },
    networkTraffic: { ok: true },
  },
  hasPartialFailure: false,
  failedSections: [],
  lastUpdate: '2026-11-20T10:00:00Z',
})

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MonitoringView />
    </QueryClientProvider>
  )
}

describe('MonitoringView 6-Tab 外壳、引擎健康浮层与值班投屏模式', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSearchParamsString = ''
    mockReplace.mockReset()
    mockedPermissions = {}
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: buildEnvelope(),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      {
        id: 10,
        name: '核心机房',
        parent_id: null,
        device_count: 6,
        online_count: 5,
        alert_count: 1,
        alerts_limited_by_permission: false,
      },
    ])
    ;(getEngineHealth as jest.Mock).mockResolvedValue({
      duration_ms: 420,
      total_devices: 12,
      success_devices: 10,
      failed_devices: 1,
      backoff_devices: 1,
      pending_write_queue: 3,
      last_round_finished_at: '2026-11-20T10:00:00Z',
      backoff_device_list: [
        {
          device_id: 99,
          device_name: 'Core-SW-99',
          last_error_code: 'auth_failed',
          last_error_message: 'SNMP 认证或团体字校验失败，请核对设备凭据与 SNMP 版本配置',
          consecutive_failures: 4,
        },
      ],
    })
    ;(getMonitoringTopN as jest.Mock).mockResolvedValue({
      metric: 'cpu',
      unit: '%',
      items: [],
    })
  })

  it('渲染 6 个去黑话中文 Tab 并支持点击切换与 URL 查询参数同步', async () => {
    const user = userEvent.setup()
    renderView()

    const expectedLabels = [
      '总览大屏',
      '设备监控',
      '实时指标明细',
      '监控方案',
      '告警规则',
      '计划维护',
    ]
    for (const label of expectedLabels) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }

    // 确认无 Zabbix 开发者黑话
    for (const jargon of ['LLD', 'Ad-hoc', 'Hysteresis', '{$']) {
      expect(screen.queryByText(new RegExp(jargon.replace('{', '\\{'), 'i'))).not.toBeInTheDocument()
    }

    await user.click(screen.getByRole('tab', { name: '监控方案' }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/monitoring?tab=templates', { scroll: false })
    })
  })

  it('支持 URL 初始化 tab/groupId/hostId 并弹出对应上下文', async () => {
    mockSearchParamsString = 'tab=latest&groupId=10&hostId=99'
    renderView()

    expect(screen.getByRole('tab', { name: '实时指标明细' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('dialog', { name: '设备监控详情抽屉' })).toHaveTextContent('99')
  })

  it('顶栏「设备分组筛选」不再提供新建分组入口，点击分组项仍可正确筛选', async () => {
    const user = userEvent.setup()
    renderView()

    expect(screen.queryByRole('button', { name: /\+ 新建分组/ })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: '设备分组筛选' })
    await user.click(trigger)

    const groupOption = await screen.findByRole('button', { name: /核心机房/ })
    expect(screen.queryByRole('button', { name: /\+ 新建分组/ })).not.toBeInTheDocument()

    await user.click(groupOption)
    expect(trigger).toHaveTextContent('核心机房')
  })

  it('点击顶栏「实时采样」弹出采集引擎健康浮层并可点击退避设备打开抽屉', async () => {
    const user = userEvent.setup()
    renderView()

    const trigger = await screen.findByRole('button', { name: '采集引擎健康状态' })
    expect(trigger).toHaveTextContent('实时采样')
    await waitFor(() => {
      expect(trigger).toHaveTextContent('420ms')
    })

    await user.click(trigger)
    expect(await screen.findByText('采集引擎状态')).toBeInTheDocument()
    expect(screen.getByText('420 ms')).toBeInTheDocument()
    expect(screen.getByText(/SNMP 认证或团体字校验失败/)).toBeInTheDocument()

    await user.click(screen.getByText('Core-SW-99'))
    expect(screen.getByRole('dialog', { name: '设备监控详情抽屉' })).toHaveTextContent('99')
  })

  it('点击「值班投屏」进入全屏投屏模式（渲染三层大屏网格与实时时钟，移除旧 6 卡片）且 Esc 可退出', async () => {
    const user = userEvent.setup()
    const envelope = buildEnvelope()
    envelope.data.statsV2 = [
      { id: 'total_devices', title: '总设备', value: '12' },
      { id: 'active_alerts', title: '活跃告警', value: '2' },
      { id: 'avg_cpu', title: 'CPU使用率', value: '35.2%' },
      { id: 'avg_memory', title: '内存使用率', value: '51.4%' },
      { id: 'peak_outbound', title: '上行流量', value: '120 Mbps' },
      { id: 'peak_inbound', title: '下行流量', value: '240 Mbps' },
    ]
    envelope.data.groupSummaries = [
      {
        group_id: 10,
        group_name: '核心机房',
        total_devices: 12,
        online_devices: 11,
        offline_devices: 1,
        warning_devices: 1,
        max_cpu: 76.5,
        max_memory: 64.2,
      },
    ]
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: envelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    renderView()

    await user.click(screen.getByRole('button', { name: '值班投屏' }))
    expect(screen.getByTestId('monitoring-kiosk-view')).toBeInTheDocument()
    expect(screen.getByText(/30s 后自动刷新/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '监控方案' })).not.toBeInTheDocument()

    expect(screen.getByText('全网健康与负载分布')).toBeInTheDocument()
    expect(screen.getByText('活跃告警 2')).toBeInTheDocument()
    expect(screen.getByText('核心机房')).toBeInTheDocument()
    expect(screen.getByText('系统性能趋势')).toBeInTheDocument()
    expect(screen.getByText('设备温度监控')).toBeInTheDocument()
    expect(screen.getByText('流量监控')).toBeInTheDocument()
    expect(screen.getByText('全网负载 Top 5 排行')).toBeInTheDocument()
    expect(screen.getByText('活跃告警与问题')).toBeInTheDocument()
    expect(screen.getByText('近1小时')).toBeInTheDocument()
    expect(screen.getByTestId('kiosk-live-clock')).toHaveTextContent(
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
    )

    for (const legacyTitle of ['总设备', 'CPU使用率', '内存使用率', '上行流量', '下行流量']) {
      expect(screen.queryByText(legacyTitle)).not.toBeInTheDocument()
    }

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('monitoring-kiosk-view')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: '监控方案' })).toBeInTheDocument()
  })

  it('正常总览大屏不再渲染 6 个均值卡片，并在 HealthDistributionBar 按 alerts:read 权限门控展示活跃告警徽标', () => {
    const envelope = buildEnvelope()
    envelope.data.statsV2 = [
      { id: 'total_devices', title: '总设备', value: '12' },
      { id: 'active_alerts', title: '活跃告警', value: '3' },
      { id: 'avg_cpu', title: 'CPU使用率', value: '35.2%' },
      { id: 'avg_memory', title: '内存使用率', value: '51.4%' },
      { id: 'peak_outbound', title: '上行流量', value: '120 Mbps' },
      { id: 'peak_inbound', title: '下行流量', value: '240 Mbps' },
    ]
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: envelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { unmount } = renderView()
    for (const legacyTitle of ['总设备', 'CPU使用率', '内存使用率', '上行流量', '下行流量']) {
      expect(screen.queryByText(legacyTitle)).not.toBeInTheDocument()
    }
    expect(screen.getByText('活跃告警 3')).toBeInTheDocument()
    unmount()

    // 缺失 statsV2.active_alerts 时回退 activeProblems.length
    const fallbackEnvelope = buildEnvelope()
    fallbackEnvelope.data.statsV2 = []
    fallbackEnvelope.data.activeProblems = [
      {
        alert_id: 1,
        device_id: 11,
        device_name: 'Core-SW-01',
        title: 'CPU 过高',
        severity: 'warning',
        status: 'active',
      },
    ]
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: fallbackEnvelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })
    const { unmount: unmountFallback } = renderView()
    expect(screen.getByText('活跃告警 1')).toBeInTheDocument()
    unmountFallback()

    // 缺少 alerts:read 权限时不展示活跃告警徽标
    mockedPermissions = { 'alerts:read': false }
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: envelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })
    renderView()
    expect(screen.queryByText(/活跃告警 \d+/)).not.toBeInTheDocument()
  })

  it('缺少 alerts:read 权限时活跃问题区展示优雅降级提示而非报错崩溃', () => {
    mockedPermissions = { 'alerts:read': false }
    renderView()

    expect(
      screen.getByText(/当前账号缺少告警查看权限（alerts:read）/)
    ).toBeInTheDocument()
  })
})
