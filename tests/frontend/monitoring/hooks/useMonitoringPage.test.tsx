import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useMonitoringPage } from '@/features/monitoring/hooks/useMonitoringPage'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'
import { INTERFACE_TRAFFIC_QUERY_KEY } from '@/features/monitoring/hooks/useDeviceInterfaceTraffic'
import type { MonitoringDataEnvelope } from '@/features/monitoring/types'

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/lib/websocket', () => ({
  WebSocketEvents: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    NETWORK_STATS_UPDATE: 'network_stats_update',
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
  useWebSocket: () => ({
    getHealthStatus: () => 'connected',
    subscribeToDeviceMonitoring: jest.fn(),
    unsubscribeFromDeviceMonitoring: jest.fn(),
    subscribeToAlerts: jest.fn(),
    unsubscribeFromAlerts: jest.fn(),
  }),
  useWebSocketEvent: jest.fn(),
}))

const buildEnvelope = (failedSections: MonitoringDataEnvelope['failedSections']): MonitoringDataEnvelope => ({
  data: {
    systemPerformance: [],
    temperatureHistory: [],
    deviceStatusDistribution: { healthy: 0, warning: 0, critical: 0, offline: 0 },
    networkTrafficHistory: [],
    statsV2: [],
    realtimeAlerts: [],
    lastUpdate: '2026-09-10T02:00:00.000Z',
  },
  sections: {
    stats: { ok: true },
    systemPerformance: { ok: true },
    temperature: { ok: true },
    deviceStatus: { ok: true },
    networkTraffic: { ok: !failedSections.includes('networkTraffic'), message: 'traffic down' },
    realtimeAlerts: { ok: true },
  },
  hasPartialFailure: failedSections.length > 0,
  failedSections,
  lastUpdate: '2026-09-10T02:00:00.000Z',
})

function renderPage(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useMonitoringPage(), { wrapper })
}

describe('useMonitoringPage', () => {
  const v2Refetch = jest.fn()

  beforeEach(() => {
    localStorage.clear()
    v2Refetch.mockReset()
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: buildEnvelope([]),
      isLoading: false,
      error: null,
      refetch: v2Refetch,
      isRefetching: false,
    })
  })

  it('页面 refetch 同时刷新 v2 聚合数据与接口流量查询', () => {
    const queryClient = new QueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderPage(queryClient)

    act(() => {
      void result.current.refetch()
    })

    expect(v2Refetch).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [INTERFACE_TRAFFIC_QUERY_KEY] })
  })

  it('单设备接口视图下，v2 流量分区失败不计入页面降级提示', () => {
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: buildEnvelope(['networkTraffic']),
      isLoading: false,
      error: null,
      refetch: v2Refetch,
      isRefetching: false,
    })
    localStorage.setItem('monitoring:deviceIds', JSON.stringify([6]))

    const { result } = renderPage(new QueryClient())

    expect(result.current.hasEffectivePartialFailure).toBe(false)
    expect(result.current.effectiveFailedSectionLabels).toEqual([])
  })

  it('全部设备（聚合视图）下，v2 流量分区失败仍计入页面降级提示', () => {
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: buildEnvelope(['networkTraffic']),
      isLoading: false,
      error: null,
      refetch: v2Refetch,
      isRefetching: false,
    })

    const { result } = renderPage(new QueryClient())

    expect(result.current.hasEffectivePartialFailure).toBe(true)
    expect(result.current.effectiveFailedSectionLabels).toEqual(['网络流量'])
  })
})
