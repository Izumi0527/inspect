import React from 'react'
import { render, screen } from '@testing-library/react'

import { DashboardView } from '@/features/dashboard/components/DashboardView'

const mockUseDashboardData = jest.fn()
const mockUseDashboardConfig = jest.fn()
const mockUseDashboardAutoRefresh = jest.fn()
const mockUseAlertAnalysis = jest.fn()
const mockUseSidebar = jest.fn()

jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDashboardData: () => mockUseDashboardData(),
  useDashboardConfig: () => mockUseDashboardConfig(),
  useDashboardAutoRefresh: (...args: unknown[]) => mockUseDashboardAutoRefresh(...args),
  useAlertAnalysis: (...args: unknown[]) => mockUseAlertAnalysis(...args),
}))

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => mockUseSidebar(),
}))

jest.mock('@/features/dashboard/components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

jest.mock('@/features/dashboard/components/DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}))

jest.mock('@/features/dashboard/components/StatsGrid', () => ({
  StatsGrid: () => <div data-testid="stats-grid" />,
}))

jest.mock('@/features/dashboard/components/RecentAlertsCard', () => ({
  RecentAlertsCard: () => <div data-testid="recent-alerts-card" />,
}))

jest.mock('@/features/dashboard/components/QuickActionsCard', () => ({
  QuickActionsCard: () => <div data-testid="quick-actions-card" />,
}))

jest.mock('@/features/dashboard/components/NetworkOverviewCard', () => ({
  NetworkOverviewCard: () => <div data-testid="network-overview-card" />,
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
    mockUseDashboardData.mockReturnValue({
      data: {
        stats: [],
        recentAlerts: [],
        networkOverview: [],
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
          recentAlerts: { ok: false, message: '最近告警加载失败' },
          networkOverview: { ok: false, message: '网络概览加载失败' },
        },
      },
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refreshStats: jest.fn(),
      loadData: jest.fn(),
    })

    render(<DashboardView />)

    expect(screen.getByText('部分分区暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('最近告警加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络概览加载失败')).toBeInTheDocument()
  })
})
