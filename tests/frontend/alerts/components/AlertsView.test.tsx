import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlertsView } from '@/features/alerts/components/AlertsView'

const mockHandleAcknowledgeAlert = jest.fn<Promise<void>, [string, (string | undefined)?]>()
const mockLoadAlerts = jest.fn<Promise<void>, []>()
const mockLoadStats = jest.fn<Promise<void>, []>()
const wsHandlers = new Map<string, (payload?: unknown) => void>()

jest.mock('@/features/alerts/hooks/useAlerts', () => ({
  useAlerts: () => ({
    alerts: [
      {
        id: '1',
        title: '测试告警',
        message: '测试消息',
        severity: 'warning',
        status: 'active',
        category: 'other',
        device: '设备A',
        timestamp: new Date(),
      },
    ],
    loading: false,
    error: null,
    pagination: {
      page: 1,
      pageSize: 10,
      total: 1,
      hasNext: false,
      hasPrev: false,
    },
    handleAcknowledgeAlert: mockHandleAcknowledgeAlert,
    handleResolveAlert: jest.fn(),
    handleDeleteAlert: jest.fn(),
    loadAlerts: mockLoadAlerts,
  }),
  useAlertStats: () => ({
    stats: {
      total: 1,
      critical: 0,
      warning: 1,
      info: 0,
      active: 1,
      acknowledged: 0,
      resolved: 0,
      byCategory: {},
      byDevice: {},
    },
    loading: false,
    error: null,
    loadStats: mockLoadStats,
  }),
  useAlertFilters: () => ({
    filters: {
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'all',
    },
    updateFilter: jest.fn(),
  }),
  useAlertSelection: () => ({
    selectedAlerts: [],
    toggleAlert: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
    handleBulkAction: jest.fn(),
  }),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/alerts/components/AlertStatsGrid', () => ({
  AlertStatsGrid: () => <div data-testid="alert-stats-grid">stats</div>,
}))

jest.mock('@/features/alerts/components/AlertFiltersBar', () => ({
  AlertFiltersBar: () => <div data-testid="alert-filters-bar">filters</div>,
}))

jest.mock('@/features/alerts/components/AlertList', () => ({
  AlertList: ({ onAcknowledge }: { onAcknowledge: (id: string) => Promise<void> }) => (
    <button type="button" onClick={() => void onAcknowledge('1')}>
      触发单条确认
    </button>
  ),
}))

jest.mock('@/features/alerts/components/AlertDetailModal', () => ({
  AlertDetailModal: () => null,
}))

jest.mock('@/features/alerts/components/AdvancedFilters', () => ({
  AdvancedFilters: () => <div data-testid="advanced-filters">advanced</div>,
}))

jest.mock('@/components/atoms/skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card">skeleton-card</div>,
  SkeletonList: () => <div data-testid="skeleton-list">skeleton-list</div>,
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/websocket', () => ({
  WebSocketEvents: {
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
  useWebSocketEvent: (event: string, handler: (payload?: unknown) => void) => {
    wsHandlers.set(event, handler)
  },
}))

jest.mock('@/features/alerts/api/alerts.api', () => ({
  exportAlerts: jest.fn(),
}))

describe('AlertsView', () => {
  beforeEach(() => {
    wsHandlers.clear()
    mockHandleAcknowledgeAlert.mockResolvedValue(undefined)
    mockLoadAlerts.mockResolvedValue(undefined)
    mockLoadStats.mockResolvedValue(undefined)
  })

  it('单条确认后应刷新列表和统计', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByRole('button', { name: '触发单条确认' }))

    await waitFor(() => {
      expect(mockHandleAcknowledgeAlert).toHaveBeenCalledWith('1', undefined)
      expect(mockLoadAlerts).toHaveBeenCalledTimes(1)
      expect(mockLoadStats).toHaveBeenCalledTimes(1)
    })
  })

  it('本端操作对应的WS事件不应触发二次刷新，不同告警事件仍应刷新', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByRole('button', { name: '触发单条确认' }))
    await waitFor(() => {
      expect(mockLoadAlerts).toHaveBeenCalledTimes(1)
      expect(mockLoadStats).toHaveBeenCalledTimes(1)
    })

    const updateHandler = wsHandlers.get('alert_update')
    expect(updateHandler).toBeDefined()
    await act(async () => {
      updateHandler?.({ id: '1', status: 'acknowledged' })
    })

    expect(mockLoadAlerts).toHaveBeenCalledTimes(1)
    expect(mockLoadStats).toHaveBeenCalledTimes(1)

    await act(async () => {
      updateHandler?.({ id: '2', status: 'acknowledged' })
    })

    await waitFor(() => {
      expect(mockLoadAlerts).toHaveBeenCalledTimes(2)
      expect(mockLoadStats).toHaveBeenCalledTimes(2)
    })
  })
})
