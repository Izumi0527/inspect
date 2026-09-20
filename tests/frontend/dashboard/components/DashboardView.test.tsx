import React from 'react'
import { render, screen } from '@testing-library/react'

import { DashboardView } from '@/features/dashboard/components/DashboardView'

const mockUseDashboardData = jest.fn()
const mockUseDashboardConfig = jest.fn()
const mockUseDashboardAutoRefresh = jest.fn()
const mockUseDashboardAlertRealtimeRefresh = jest.fn()
const mockUseAlertAnalysis = jest.fn()
const mockUseSidebar = jest.fn()

jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDashboardData: () => mockUseDashboardData(),
  useDashboardConfig: () => mockUseDashboardConfig(),
  useDashboardAutoRefresh: (...args: unknown[]) => mockUseDashboardAutoRefresh(...args),
  useDashboardAlertRealtimeRefresh: (...args: unknown[]) => mockUseDashboardAlertRealtimeRefresh(...args),
  useAlertAnalysis: (...args: unknown[]) => mockUseAlertAnalysis(...args),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => mockUseSidebar(),
}))

jest.mock('@/features/dashboard/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

jest.mock('@/features/dashboard/components/DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}))

jest.mock('@/features/dashboard/components/StatsGrid', () => ({
  StatsGrid: () => <div data-testid="stats-grid" />,
}))

const mockActiveAlertsCard = jest.fn()
jest.mock('@/features/dashboard/components/ActiveAlertsCard', () => ({
  ActiveAlertsCard: (props: Record<string, unknown>) => {
    mockActiveAlertsCard(props)
    return <div data-testid="active-alerts-card" />
  },
}))

jest.mock('@/features/dashboard/components/QuickActionsCard', () => ({
  QuickActionsCard: () => <div data-testid="quick-actions-card" />,
}))

const mockNetworkOverviewCard = jest.fn()
jest.mock('@/features/dashboard/components/NetworkOverviewCard', () => ({
  NetworkOverviewCard: (props: Record<string, unknown>) => {
    mockNetworkOverviewCard(props)
    return <div data-testid="network-overview-card" />
  },
}))

describe('DashboardView', () => {
  beforeEach(() => {
    mockUseDashboardConfig.mockReturnValue({
      config: {
        autoRefresh: false,
        refreshInterval: 60000,
      },
    })
    mockUseAlertAnalysis.mockReturnValue({ high: 0 })
    mockUseSidebar.mockReturnValue({
      sidebarOpen: true,
      toggleSidebar: jest.fn(),
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('分区加载失败时应展示局部失败提示，而不是只显示权限受限提示', () => {
    const refreshStats = jest.fn()
    mockUseDashboardData.mockReturnValue({
      data: {
        stats: [],
        activeAlerts: [],
        networkOverview: [],
        networkTopology: { nodes: [], links: [] },
        lastUpdated: new Date('2026-04-03T00:00:00.000Z'),
        permissions: {
          devices: true,
          alerts: true,
          monitoring: true,
        },
        sections: {
          stats: { ok: true },
          statsDevices: { ok: true },
          statsAlerts: { ok: true },
          statsBandwidth: { ok: true },
          activeAlerts: { ok: false, message: '实时告警加载失败' },
          networkOverview: { ok: false, message: '网络概览加载失败' },
        },
      },
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refreshStats,
      loadData: jest.fn(),
    })

    render(<DashboardView />)

    expect(screen.getByTestId('active-alerts-card')).toBeInTheDocument()
    expect(screen.getByText('部分分区暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('实时告警加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络概览加载失败')).toBeInTheDocument()
    // 实时告警依赖告警推送刷新：有 alerts:read 时以总览刷新函数接入告警事件联动
    expect(mockUseDashboardAlertRealtimeRefresh).toHaveBeenCalledWith(refreshStats, true)
  })

  it('网络概览占左列，右列是快捷入口在上、实时告警在下，并把编辑权限传给网络概览', () => {
    mockUseDashboardData.mockReturnValue({
      data: {
        stats: [],
        activeAlerts: [],
        activeAlertsTotal: 25,
        networkOverview: [],
        networkTopology: { nodes: [], links: [] },
        lastUpdated: new Date('2026-09-20T00:00:00.000Z'),
        permissions: { devices: true, alerts: true, monitoring: true },
        sections: {
          stats: { ok: true },
          statsDevices: { ok: true },
          statsAlerts: { ok: true },
          statsBandwidth: { ok: true },
          activeAlerts: { ok: true },
          networkOverview: { ok: true },
        },
      },
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refreshStats: jest.fn(),
      loadData: jest.fn(),
    })

    render(<DashboardView />)

    const primary = screen.getByTestId('dashboard-primary-column')
    const secondary = screen.getByTestId('dashboard-secondary-column')
    expect(primary).toContainElement(screen.getByTestId('network-overview-card'))
    expect(secondary).toContainElement(screen.getByTestId('quick-actions-card'))
    expect(secondary).toContainElement(screen.getByTestId('active-alerts-card'))
    // 快捷入口在实时告警上方
    expect(
      screen.getByTestId('quick-actions-card').compareDocumentPosition(screen.getByTestId('active-alerts-card'))
      & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // 布局改动：网络概览左列占两栏
    expect(primary.className).toContain('lg:col-span-2')

    expect(mockNetworkOverviewCard).toHaveBeenCalledWith(expect.objectContaining({ canEditLayout: true }))
    expect(mockActiveAlertsCard).toHaveBeenCalledWith(expect.objectContaining({ total: 25 }))
  })
})
