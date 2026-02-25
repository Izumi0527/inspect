import React from 'react'
import { render, screen } from '@testing-library/react'
import { MonitoringView } from '@/features/monitoring/components/MonitoringView'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
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
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
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

describe('MonitoringView', () => {
  it('存在分区失败时应显示全局不完整提示和分区错误占位', () => {
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: {
        data: {
          statsV2: [{ id: 'total_devices', title: '总设备', value: '1' }],
          systemPerformance: [{ timestamp: '2026-02-24T12:00:00.000Z', cpu: 10, memory: 20, network: 1 }],
          temperatureHistory: [{ timestamp: '2026-02-24T12:00:00.000Z', devices: { edge: 45 } }],
          deviceStatusDistribution: { healthy: 1, warning: 0, critical: 0, offline: 0 },
          availability: { current: 99.9, target: 99.9, trend: 'stable' as const },
          networkTrafficHistory: [],
          realtimeAlerts: [],
        },
        hasPartialFailure: true,
        failedSections: ['networkTraffic'],
        sections: {
          stats: { ok: true },
          systemPerformance: { ok: true },
          temperature: { ok: true },
          deviceStatus: { ok: true },
          availability: { ok: true },
          networkTraffic: { ok: false, message: 'network failed' },
          realtimeAlerts: { ok: true },
        },
        lastUpdate: '2026-02-24T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    render(<MonitoringView />)

    expect(screen.getByText('监控数据不完整')).toBeInTheDocument()
    expect(screen.getByText('网络流量数据加载失败')).toBeInTheDocument()
  })

  it('多个分区失败时应分别显示对应失败文案', () => {
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
        hasPartialFailure: true,
        failedSections: [
          'stats',
          'systemPerformance',
          'temperature',
          'deviceStatus',
          'availability',
          'networkTraffic',
          'realtimeAlerts',
        ],
        sections: {
          stats: { ok: false, message: 'stats down' },
          systemPerformance: { ok: false, message: 'perf down' },
          temperature: { ok: false, message: 'temp down' },
          deviceStatus: { ok: false, message: 'device down' },
          availability: { ok: false, message: 'availability down' },
          networkTraffic: { ok: false, message: 'traffic down' },
          realtimeAlerts: { ok: false, message: 'alerts down' },
        },
        lastUpdate: '2026-02-24T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    })

    render(<MonitoringView />)

    expect(screen.getByText('监控数据不完整')).toBeInTheDocument()
    expect(screen.getByText('统计指标加载失败')).toBeInTheDocument()
    expect(screen.getByText('系统性能数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('温度数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('设备状态分布加载失败')).toBeInTheDocument()
    expect(screen.getByText('可用性数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络流量数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('实时告警加载失败')).toBeInTheDocument()
  })
})
