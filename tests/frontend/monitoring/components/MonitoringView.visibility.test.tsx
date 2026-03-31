import React from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { MonitoringView } from '@/features/monitoring/components/MonitoringView'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => ({
    sidebarOpen: false,
    toggleSidebar: jest.fn(),
  }),
}))

jest.mock('@/features/dashboard/components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">sidebar</div>,
}))

jest.mock('@/features/dashboard', () => ({
  DashboardHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}))

jest.mock('@/components/shared', () => ({
  StatCard: ({ title }: { title: string }) => <div>{title}</div>,
  CompactStatCard: ({ title }: { title: string }) => <div>{title}</div>,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <div />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/hooks', () => ({
  useInView: () => ({
    ref: jest.fn(),
    inView: true,
  }),
}))

jest.mock('@/features/monitoring/components/cards', () => ({
  DeviceStatusCard: () => <div>DeviceStatusCard</div>,
  AvailabilityCard: () => <div>AvailabilityCard</div>,
  RealTimeAlertsCard: () => <div>RealTimeAlertsCard</div>,
}))

jest.mock('@/features/monitoring/components/charts', () => ({
  SystemPerformanceChartWrapper: () => <div>SystemPerformanceChartWrapper</div>,
  TemperatureChartWrapper: () => <div>TemperatureChartWrapper</div>,
  NetworkTrafficChartWrapper: () => <div>NetworkTrafficChartWrapper</div>,
  ChartSkeleton: () => <div>ChartSkeleton</div>,
}))

jest.mock('@/features/monitoring/components/ReportExportButton', () => ({
  ReportExportButton: () => <div>ReportExportButton</div>,
}))

jest.mock('@/features/monitoring/components/sections', () => ({
  StatsSection: () => <div>StatsSection</div>,
  PerformanceSection: () => <div>PerformanceSection</div>,
  StatusSection: () => <div>StatusSection</div>,
  NetworkSection: () => <div>NetworkSection</div>,
}))

jest.mock('@/features/monitoring/components/shared', () => ({
  MonitoringLoadingSkeleton: () => <div>MonitoringLoadingSkeleton</div>,
  MonitoringErrorPanel: () => <div>MonitoringErrorPanel</div>,
  MonitoringHeaderActions: () => <div>MonitoringHeaderActions</div>,
}))

const wsHandlers: Record<string, ((payload: unknown) => void) | undefined> = {}
const ws = {
  isConnected: jest.fn(() => true),
  getHealthStatus: jest.fn(() => 'connected'),
  subscribeToDeviceMonitoring: jest.fn(),
  unsubscribeFromDeviceMonitoring: jest.fn(),
  subscribeToAlerts: jest.fn(),
  unsubscribeFromAlerts: jest.fn(),
}

jest.mock('@/lib/websocket', () => ({
  WebSocketEvents: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    NETWORK_STATS_UPDATE: 'network_stats_update',
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
  useWebSocket: () => ws,
  useWebSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    wsHandlers[event] = handler
  },
}))

describe('MonitoringView 可见性与 WS 行为', () => {
  let visibilityState = 'hidden'

  beforeEach(() => {
    visibilityState = 'hidden'
    ws.isConnected.mockReturnValue(true)
    ws.subscribeToDeviceMonitoring.mockClear()
    ws.unsubscribeFromDeviceMonitoring.mockClear()
    ws.subscribeToAlerts.mockClear()
    ws.unsubscribeFromAlerts.mockClear()
    Object.keys(wsHandlers).forEach((k) => delete wsHandlers[k])

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })

    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: {
        data: {
          statsV2: [],
          systemPerformance: [],
          temperatureHistory: [],
          deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
          availability: { current: 0, target: 99.9, trend: 'stable' as const },
          networkTrafficHistory: [],
          realtimeAlerts: [],
        },
        hasPartialFailure: false,
        failedSections: [],
        sections: {
          stats: { ok: true },
          systemPerformance: { ok: true },
          temperature: { ok: true },
          deviceStatus: { ok: true },
          availability: { ok: true },
          networkTraffic: { ok: true },
          realtimeAlerts: { ok: true },
        },
        lastUpdate: '2026-02-24T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })
  })

  it('页面不可见时应退订 WS 房间且不订阅', async () => {
    render(<MonitoringView />)

    await waitFor(() => {
      expect(ws.unsubscribeFromDeviceMonitoring).toHaveBeenCalled()
      expect(ws.unsubscribeFromAlerts).toHaveBeenCalled()
    })

    expect(ws.subscribeToDeviceMonitoring).not.toHaveBeenCalled()
    expect(ws.subscribeToAlerts).not.toHaveBeenCalled()
  })

  it('页面从不可见切回可见时，应订阅 WS 房间', async () => {
    render(<MonitoringView />)

    await waitFor(() => {
      expect(ws.unsubscribeFromDeviceMonitoring).toHaveBeenCalled()
    })

    act(() => {
      visibilityState = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(ws.subscribeToDeviceMonitoring).toHaveBeenCalled()
      expect(ws.subscribeToAlerts).toHaveBeenCalled()
    })
  })

  it('页面不可见时，推送事件不应触发 refetch', async () => {
    const refetch = jest.fn()
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: {
        data: {
          statsV2: [],
          systemPerformance: [],
          temperatureHistory: [],
          deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
          availability: { current: 0, target: 99.9, trend: 'stable' as const },
          networkTrafficHistory: [],
          realtimeAlerts: [],
        },
        hasPartialFailure: false,
        failedSections: [],
        sections: {
          stats: { ok: true },
          systemPerformance: { ok: true },
          temperature: { ok: true },
          deviceStatus: { ok: true },
          availability: { ok: true },
          networkTraffic: { ok: true },
          realtimeAlerts: { ok: true },
        },
        lastUpdate: '2026-02-24T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      refetch,
      isRefetching: false,
    })

    render(<MonitoringView />)

    await waitFor(() => {
      expect(wsHandlers.network_stats_update).toBeDefined()
    })

    act(() => {
      wsHandlers.network_stats_update?.({})
    })

    expect(refetch).not.toHaveBeenCalled()
  })

  it('WS 连接建立后应触发一次首轮 refetch（页面可见）', async () => {
    visibilityState = 'visible'
    const refetch = jest.fn()
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: {
        data: {
          statsV2: [],
          systemPerformance: [],
          temperatureHistory: [],
          deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
          availability: { current: 0, target: 99.9, trend: 'stable' as const },
          networkTrafficHistory: [],
          realtimeAlerts: [],
        },
        hasPartialFailure: false,
        failedSections: [],
        sections: {
          stats: { ok: true },
          systemPerformance: { ok: true },
          temperature: { ok: true },
          deviceStatus: { ok: true },
          availability: { ok: true },
          networkTraffic: { ok: true },
          realtimeAlerts: { ok: true },
        },
        lastUpdate: '2026-02-24T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      refetch,
      isRefetching: false,
    })

    render(<MonitoringView />)

    await waitFor(() => {
      expect(wsHandlers.connect).toBeDefined()
    })

    act(() => {
      wsHandlers.connect?.({})
    })

    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
