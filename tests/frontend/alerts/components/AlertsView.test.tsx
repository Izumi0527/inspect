import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AlertsView } from '@/features/alerts/components/AlertsView'

const mockHandleAcknowledgeAlert = jest.fn<Promise<void>, [string, (string | undefined)?]>()
const mockLoadAlerts = jest.fn<Promise<void>, []>()
const mockLoadStats = jest.fn<Promise<void>, []>()
const mockWsHandlers = new Map<string, (payload?: unknown) => void>()
const mockWs = {
  isConnected: jest.fn(() => true),
  subscribeToAlerts: jest.fn(),
  unsubscribeFromAlerts: jest.fn(),
}
let mockCanReadAlerts = true
let mockAlertFilters = {
  searchQuery: '',
  severityFilter: 'all',
  statusFilter: 'all',
}
const mockUpdateFilter = jest.fn()
const mockResetFilters = jest.fn()
let mockAlertsList = [
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
]
let mockAlertsLoading = false
let mockAlertsError: string | null = null

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => mockCanReadAlerts,
}))

jest.mock('@/features/alerts/hooks/useAlerts', () => ({
  useAlerts: () => ({
    alerts: mockAlertsList,
    loading: mockAlertsLoading,
    error: mockAlertsError,
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
    filters: mockAlertFilters,
    updateFilter: mockUpdateFilter,
    resetFilters: mockResetFilters,
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
  AlertStatsGrid: ({ onCardClick }: { onCardClick?: (card: string) => void }) => (
    <div data-testid="alert-stats-grid">
      <button type="button" onClick={() => onCardClick?.('critical')}>
        点击严重统计卡
      </button>
    </div>
  ),
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
  ALERT_ADVANCED_FILTERS_STORAGE_KEY: 'alert_advanced_filters',
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
    CONNECT: 'connect',
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
  useWebSocket: () => mockWs,
  useWebSocketEvent: (event: string, handler: (payload?: unknown) => void) => {
    mockWsHandlers.set(event, handler)
  },
}))

jest.mock('@/features/alerts/api/alerts.api', () => ({
  exportAlerts: jest.fn(),
}))

describe('AlertsView', () => {
  beforeEach(() => {
    mockWsHandlers.clear()
    mockWs.isConnected.mockReturnValue(true)
    mockWs.subscribeToAlerts.mockClear()
    mockWs.unsubscribeFromAlerts.mockClear()
    mockCanReadAlerts = true
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'all',
    }
    mockResetFilters.mockClear()
    mockUpdateFilter.mockClear()
    mockAlertsList = [
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
    ]
    mockAlertsLoading = false
    mockAlertsError = null
    mockHandleAcknowledgeAlert.mockResolvedValue(undefined)
    mockLoadAlerts.mockResolvedValue(undefined)
    mockLoadStats.mockResolvedValue(undefined)
  })

  it('挂载时应订阅 alerts 房间，卸载时应取消订阅', () => {
    const { unmount } = render(<AlertsView />)

    expect(mockWs.subscribeToAlerts).toHaveBeenCalledTimes(1)

    unmount()
    expect(mockWs.unsubscribeFromAlerts).toHaveBeenCalledTimes(1)
  })

  it('无 alerts:read 权限时应显示无权限提示且不订阅房间', () => {
    mockCanReadAlerts = false

    render(<AlertsView />)

    expect(screen.getByText('无权限访问告警中心')).toBeInTheDocument()
    expect(mockWs.subscribeToAlerts).toHaveBeenCalledTimes(0)
    expect(screen.queryByRole('button', { name: '触发单条确认' })).not.toBeInTheDocument()
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

    const updateHandler = mockWsHandlers.get('alert_update')
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

  it('开启筛选时WS推送不应自动刷新列表，但应提示并可手动刷新/清空筛选', async () => {
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'critical',
      statusFilter: 'all',
    }

    render(<AlertsView />)

    const updateHandler = mockWsHandlers.get('alert_update')
    expect(updateHandler).toBeDefined()

    await act(async () => {
      updateHandler?.({ id: '2', status: 'active' })
    })

    expect(mockLoadAlerts).toHaveBeenCalledTimes(0)
    expect(mockLoadStats).toHaveBeenCalledTimes(1)

    expect(screen.getByText('收到 1 条实时更新')).toBeInTheDocument()
    expect(screen.getByText(/已开启筛选，部分更新可能被隐藏/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空筛选查看' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }))

    await waitFor(() => {
      expect(mockLoadAlerts).toHaveBeenCalledTimes(1)
      expect(mockLoadStats).toHaveBeenCalledTimes(2)
    })
  })

  it('点击统计卡应映射为筛选条件并触发列表刷新', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByRole('button', { name: '点击严重统计卡' }))

    await waitFor(() => {
      expect(mockUpdateFilter).toHaveBeenCalledWith('severityFilter', 'critical')
    })
  })

  it('无筛选且无数据时应显示“暂无告警”空态', () => {
    mockAlertsList = []

    render(<AlertsView />)

    expect(screen.getByText('暂无告警')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '清空筛选' })).not.toBeInTheDocument()
  })

  it('有筛选且无匹配时应显示“没有匹配的告警”并提供清空筛选', () => {
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'critical',
      statusFilter: 'all',
    }
    mockAlertsList = []

    render(<AlertsView />)

    expect(screen.getByText('没有匹配的告警')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空筛选' })).toBeInTheDocument()
  })
})
