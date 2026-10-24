import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AlertsView } from '@/features/alerts/components/AlertsView'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

const mockHandleAcknowledgeAlert = jest.fn<Promise<void>, [string, (string | undefined)?]>()
const mockPerformBulkAction = jest.fn<Promise<boolean>, [string, unknown?]>().mockResolvedValue(true)
const mockLoadAlerts = jest.fn<Promise<void>, []>()
const mockLoadStats = jest.fn<Promise<void>, []>()
const mockWsHandlers = new Map<string, (payload?: unknown) => void>()
const mockReleaseAlertsLease = jest.fn()
const mockWs = {
  isConnected: jest.fn(() => true),
  subscribeToAlerts: jest.fn(),
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
  {
    id: '2',
    title: '测试告警2',
    message: '测试消息2',
    severity: 'critical',
    status: 'active',
    category: 'other',
    device: '设备B',
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
      total: mockAlertsList.length,
      hasNext: false,
      hasPrev: false,
    },
    handleAcknowledgeAlert: mockHandleAcknowledgeAlert,
    handleResolveAlert: jest.fn(),
    handleDeleteAlert: jest.fn(),
    performBulkAction: mockPerformBulkAction,
    loadAlerts: mockLoadAlerts,
  }),
  useAlertStats: () => ({
    stats: {
      total: 2,
      critical: 1,
      warning: 1,
      info: 0,
      active: 2,
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
  AlertList: ({
    alerts,
    selectedAlerts,
    onSelectAlert,
    onAcknowledge,
  }: {
    alerts: Array<{ id: string; title: string }>
    selectedAlerts?: string[]
    onSelectAlert?: (id: string) => void
    onAcknowledge?: (id: string) => Promise<void>
  }) => (
    <div data-testid="mock-alert-list">
      {onAcknowledge && (
        <button type="button" onClick={() => void onAcknowledge('1')}>
          触发单条确认
        </button>
      )}
      {alerts?.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            data-testid={`select-alert-${item.id}`}
            checked={selectedAlerts?.includes(item.id)}
            onChange={() => onSelectAlert?.(item.id)}
          />
          {item.title}
        </label>
      ))}
    </div>
  ),
}))

jest.mock('@/features/alerts/components/AlertDetailModal', () => ({
  AlertDetailModal: () => null,
}))

jest.mock('@/features/alerts/components/AlertTimeRangeFilter', () => ({
  AlertTimeRangeFilter: () => <div data-testid="time-range-filter">time-range</div>,
  ALERT_TIME_RANGE_FILTER_STORAGE_KEY: 'alert_time_range_filter',
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
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => mockWs,
  useWebSocketEvent: (event: string, handler: (payload?: unknown) => void) => {
    mockWsHandlers.set(event, handler)
  },
  WebSocketEvents: {
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
  },
}))

describe('AlertsView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCanReadAlerts = true
    mockAlertsLoading = false
    mockAlertsError = null
    mockPerformBulkAction.mockClear()
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
      {
        id: '2',
        title: '测试告警2',
        message: '测试消息2',
        severity: 'critical',
        status: 'active',
        category: 'other',
        device: '设备B',
        timestamp: new Date(),
      },
    ]
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'all',
    }
    mockWsHandlers.clear()
    mockWs.isConnected.mockReturnValue(true)
    mockWs.subscribeToAlerts.mockReturnValue(mockReleaseAlertsLease)
  })

  it('挂载时应申请 alerts 房间租约，卸载时只释放自己的租约', () => {
    const { unmount } = render(<AlertsView />)

    expect(mockWs.subscribeToAlerts).toHaveBeenCalledTimes(1)
    expect(mockReleaseAlertsLease).not.toHaveBeenCalled()

    unmount()

    expect(mockReleaseAlertsLease).toHaveBeenCalledTimes(1)
  })

  it('尚未连接时也应申请租约，由管理器在连接建立后重放，而不是靠页面自己监听 connect', () => {
    mockWs.isConnected.mockReturnValue(false)

    render(<AlertsView />)

    expect(mockWs.subscribeToAlerts).toHaveBeenCalledTimes(1)
  })

  it('无 alerts:read 权限时应显示无权限提示且不订阅房间', () => {
    mockCanReadAlerts = false

    render(<AlertsView />)

    expect(screen.getByText('无权限访问告警中心')).toBeInTheDocument()
    expect(mockWs.subscribeToAlerts).toHaveBeenCalledTimes(0)
    expect(screen.queryByRole('button', { name: '触发单条确认' })).not.toBeInTheDocument()
  })

  it('应将基础筛选与页面动作收拢到同一条紧凑工具栏', () => {
    render(<AlertsView />)

    expect(screen.getByTestId('alerts-toolbar-end-group')).toBeInTheDocument()
  })

  it('时间范围筛选入口应收进紧凑工具栏，不再独占一行', () => {
    render(<AlertsView />)

    const toolbar = screen.getByTestId('alerts-toolbar-end-group')
    expect(within(toolbar).getByTestId('time-range-filter')).toBeInTheDocument()
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
      searchQuery: 'core-switch',
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

  it('默认活跃视图不算“已开启筛选”：WS 推送仍自动刷新列表', async () => {
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'active',
    }

    render(<AlertsView />)

    const updateHandler = mockWsHandlers.get('alert_update')
    expect(updateHandler).toBeDefined()
    await act(async () => {
      updateHandler?.({ id: '2', status: 'active' })
    })

    await waitFor(() => {
      expect(mockLoadAlerts).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText(/已开启筛选，部分更新可能被隐藏/)).not.toBeInTheDocument()
  })

  it('默认活跃视图无数据时应提示“暂无活跃告警”并可切换到全部', () => {
    mockAlertFilters = {
      searchQuery: '',
      severityFilter: 'all',
      statusFilter: 'active',
    }
    mockAlertsList = []

    render(<AlertsView />)

    expect(screen.getByText('暂无活跃告警')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看全部告警' }))
    expect(mockUpdateFilter).toHaveBeenCalledWith('statusFilter', 'all')
  })

  it('选中告警后在底部展示 FloatingBatchActionBar，并能触发全选当前页与取消选择', () => {
    render(<AlertsView />)

    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 勾选第一项
    fireEvent.click(screen.getByTestId('select-alert-1'))
    expect(screen.getByRole('region', { name: '批量操作栏' })).toBeInTheDocument()
    expect(screen.getByText('已选择 1 项')).toBeInTheDocument()

    // 点击全选当前页
    fireEvent.click(screen.getByRole('button', { name: '全选当前页' }))
    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()

    // 点击反选当前页 (两项全选时反选变为 0 项)
    fireEvent.click(screen.getByRole('button', { name: '反选当前页' }))
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()

    // 重新勾选并取消选择
    fireEvent.click(screen.getByTestId('select-alert-1'))
    expect(screen.getByRole('region', { name: '批量操作栏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()
  })

  it('全选筛选结果与批量确认', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByTestId('select-alert-1'))
    fireEvent.click(screen.getByRole('button', { name: '全选筛选结果' }))
    expect(screen.getByText(/已全选筛选结果 \(2 项\)/)).toBeInTheDocument()

    // 批量确认
    fireEvent.click(screen.getByRole('button', { name: '批量确认' }))
    await waitFor(() => {
      expect(mockPerformBulkAction).toHaveBeenCalledWith(
        'acknowledge',
        expect.objectContaining({ selectAllFiltered: true })
      )
    })
  })

  it('显式选择单项并批量解决', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByTestId('select-alert-2'))
    expect(screen.getByRole('region', { name: '批量操作栏' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '批量解决' }))
    await waitFor(() => {
      expect(mockPerformBulkAction).toHaveBeenCalledWith(
        'resolve',
        expect.objectContaining({ alertIds: ['2'] })
      )
    })
  })

  it('点击删除打开二次确认弹窗并在确认后执行批量删除', async () => {
    render(<AlertsView />)

    fireEvent.click(screen.getByTestId('select-alert-1'))

    // 悬浮栏中的删除按钮
    const deleteBtn = screen.getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn)

    // 二次确认弹窗
    expect(screen.getByRole('heading', { name: '批量删除确认', level: 3 })).toBeInTheDocument()
    expect(screen.getByText(/您确定要批量删除选中的 1 条告警记录吗？/)).toBeInTheDocument()

    // 点击取消关闭弹窗
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('heading', { name: '批量删除确认', level: 3 })).not.toBeInTheDocument()

    // 再次打开并确认删除
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const confirmBtn = screen.getByRole('button', { name: '确认删除' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockPerformBulkAction).toHaveBeenCalledWith(
        'delete',
        expect.objectContaining({ alertIds: ['1'] })
      )
      expect(mockLoadAlerts).toHaveBeenCalled()
      expect(mockLoadStats).toHaveBeenCalled()
    })
  })
})
