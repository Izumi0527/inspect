import React from 'react'
import { render, screen } from '@testing-library/react'
import { MonitoringView } from './MonitoringView'
import type { MonitoringDataEnvelope } from '../types'

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => ({
    sidebarOpen: false,
    toggleSidebar: jest.fn(),
  }),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => false,
}))

jest.mock('@/features/dashboard/components/Sidebar', () => ({
  Sidebar: () => null,
}))

jest.mock('@/features/dashboard', () => ({
  DashboardHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="header-actions">{actions}</div>
    </div>
  ),
}))

jest.mock('@/components/shared', () => ({
  StatCard: () => null,
}))

jest.mock('./cards', () => ({
  DeviceStatusCard: () => null,
  AvailabilityCard: () => null,
  RealTimeAlertsCard: () => null,
}))

jest.mock('./charts', () => ({
  SystemPerformanceChartWrapper: () => null,
  TemperatureChartWrapper: () => null,
  NetworkTrafficChartWrapper: () => null,
  ChartSkeleton: () => null,
}))

jest.mock('./ReportExportButton', () => ({
  ReportExportButton: () => null,
}))

jest.mock('@/hooks', () => ({
  useInView: () => ({ ref: jest.fn(), inView: true }),
}))

jest.mock('../hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

jest.mock('@/lib/websocket', () => {
  const mockWs = {
    getHealthStatus: jest.fn(),
    subscribeToDeviceMonitoring: jest.fn(),
    unsubscribeFromDeviceMonitoring: jest.fn(),
    subscribeToAlerts: jest.fn(),
    unsubscribeFromAlerts: jest.fn(),
  }

  return {
    WebSocketEvents: {
      CONNECT: 'connect',
      DISCONNECT: 'disconnect',
    },
    useWebSocket: () => mockWs,
    useWebSocketEvent: jest.fn(),
    __mockWs: mockWs,
  }
})

const buildEnvelope = (lastUpdate: string): MonitoringDataEnvelope => ({
  data: {
    systemPerformance: [],
    temperatureHistory: [],
    deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
    availability: { current: 0, target: 99.9, trend: 'stable', lastUpdate },
    networkTrafficHistory: [],
    statsV2: [],
    realtimeAlerts: [],
    lastUpdate,
  },
  sections: {
    stats: { ok: true },
    systemPerformance: { ok: true },
    temperature: { ok: true },
    deviceStatus: { ok: true },
    availability: { ok: true },
    networkTraffic: { ok: true },
    realtimeAlerts: { ok: true },
  },
  hasPartialFailure: false,
  failedSections: [],
  lastUpdate,
})

describe('MonitoringView - WS 健康度与数据新鲜度提示（P2护栏）', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('当 WS stale 且数据超时未更新时，应展示“连接不活跃”与“已X未更新”提示', () => {
    const nowMs = new Date('2026-03-15T14:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(nowMs)

    const lastUpdate = new Date(nowMs - (10 * 60 * 1000 + 1000)).toISOString()
    const envelope = buildEnvelope(lastUpdate)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const useMonitoringV2Module = require('../hooks/useMonitoringV2') as { useMonitoringV2: jest.Mock }
    useMonitoringV2Module.useMonitoringV2.mockReturnValue({
      data: envelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const wsModule = require('@/lib/websocket') as { __mockWs: { getHealthStatus: jest.Mock } }
    wsModule.__mockWs.getHealthStatus.mockReturnValue('stale')

    const { unmount } = render(<MonitoringView />)

    expect(screen.getByText('连接不活跃')).toBeInTheDocument()
    expect(screen.getByText(/已10\s*分钟未更新/)).toBeInTheDocument()

    unmount()
  })

  it('当 WS connected 且数据新鲜时，不应显示“未更新”追加文案', () => {
    const nowMs = new Date('2026-03-15T14:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(nowMs)

    const lastUpdate = new Date(nowMs - 2 * 60 * 1000).toISOString()
    const envelope = buildEnvelope(lastUpdate)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const useMonitoringV2Module = require('../hooks/useMonitoringV2') as { useMonitoringV2: jest.Mock }
    useMonitoringV2Module.useMonitoringV2.mockReturnValue({
      data: envelope,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const wsModule = require('@/lib/websocket') as { __mockWs: { getHealthStatus: jest.Mock } }
    wsModule.__mockWs.getHealthStatus.mockReturnValue('connected')

    const { unmount } = render(<MonitoringView />)

    expect(screen.getByText('实时连接')).toBeInTheDocument()
    expect(screen.queryByText(/未更新/)).not.toBeInTheDocument()

    unmount()
  })
})
