import React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { DeviceManagementView } from '@/features/devices/components/DeviceManagementView'
import { DashboardView } from '@/features/dashboard/components/DashboardView'
import { NetworkOverviewCard } from '@/features/dashboard/components/NetworkOverviewCard'
import { AlertsView } from '@/features/alerts/components/AlertsView'
import { useURLFilters } from '@/features/inspection/hooks/useURLFilters'
import { InspectionView } from '@/features/inspection/components/InspectionView'
import { InspectionExecutions } from '@/features/inspection/components/InspectionExecutions'
import {
  batchDeleteInspectionExecutions,
  fetchInspectionExecutions,
} from '@/features/inspection/api/inspection.api'
import { useLogFilters } from '@/features/logs/hooks/useLogs'
import { fetchDevice, fetchDeviceStats } from '@/features/devices/api/devices.api'
import { api } from '@/lib/api-client'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'

let mockSearchParams = new URLSearchParams()
const mockRouterReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockRouterReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      permissions: ['devices:read', 'devices:create', 'devices:update', 'devices:delete'],
    },
  }),
  usePermission: () => true,
}))

jest.mock('@/lib/contexts/sidebar-context', () => ({
  useSidebar: () => ({ sidebarOpen: true, toggleSidebar: jest.fn() }),
}))

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  }),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

// Devices mocks
jest.mock('@/features/devices/api/devices.api', () => ({
  fetchDevice: jest.fn(),
  fetchDeviceStats: jest.fn(),
  updateDevice: jest.fn(),
  batchDeleteDevices: jest.fn(),
  fetchDeviceInspectionCount: jest.fn(),
  batchProbeDevices: jest.fn(),
  bulkUpdateDevices: jest.fn(),
  fetchAllFilteredDevices: jest.fn(),
}))

jest.mock('@/features/devices/hooks/useDevices', () => ({
  useDevices: () => ({
    devices: [],
    total: 0,
    loading: false,
    error: null,
    errorStatus: null,
    setError: jest.fn(),
    addDevice: jest.fn(),
    removeDevice: jest.fn(),
    importDevices: jest.fn(),
    loadDevices: jest.fn(() => Promise.resolve()),
  }),
  useDeviceFilters: () => ({
    filters: { searchQuery: '', statusFilter: 'all', typeFilter: 'all' },
    updateFilter: jest.fn(),
  }),
}))

jest.mock('@/features/devices/components/modals/DeviceDetailsModal', () => ({
  DeviceDetailsModal: ({
    isOpen,
    device,
    onClose,
  }: {
    isOpen: boolean
    device: { id: number; name: string } | null
    onClose: () => void
  }) =>
    isOpen ? (
      <div data-testid="device-details-modal">
        <span>{device ? `${device.id}:${device.name}` : 'loading'}</span>
        <button type="button" onClick={onClose}>
          关闭详情
        </button>
      </div>
    ) : null,
}))

jest.mock('@/features/devices/components/modals/AddDeviceModal', () => ({
  AddDeviceModal: () => null,
}))
jest.mock('@/features/devices/components/modals/EditDeviceModal', () => ({
  EditDeviceModal: () => null,
}))
jest.mock('@/features/devices/components/BulkDeviceImport', () => ({
  BulkDeviceImport: () => null,
}))
jest.mock('@/features/devices/components/BulkDeviceUpdate', () => ({
  BulkDeviceUpdate: () => null,
}))
jest.mock('@/features/devices/components/DeviceGroupModal', () => ({
  DeviceGroupModal: () => null,
}))

// Dashboard mocks
jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDashboardData: () => ({
    data: {
      stats: [],
      activeAlerts: [],
      networkOverview: [],
      networkTopology: {
        nodes: [
          {
            id: 1,
            name: 'core-01',
            ip: '10.0.0.1',
            deviceType: 'switch',
            vendor: 'huawei',
            model: 'S5700',
            firmwareVersion: 'V200',
            status: 'online',
            unmanagedNeighbors: 0,
          },
          {
            id: 2,
            name: 'agg-02',
            ip: '10.0.0.2',
            deviceType: 'switch',
            vendor: 'huawei',
            model: 'S5700',
            firmwareVersion: 'V200',
            status: 'online',
            unmanagedNeighbors: 0,
          },
        ],
        links: [
          {
            id: '1-2',
            source: 1,
            target: 2,
            sourcePort: 'GE0/0/1',
            targetPort: 'GE0/0/24',
            bidirectional: true,
          },
        ],
      },
      sections: {},
    },
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    refreshStats: jest.fn(),
    loadData: jest.fn(),
  }),
  useDashboardConfig: () => ({ config: { autoRefresh: false, refreshInterval: 60000 } }),
  useDashboardAutoRefresh: jest.fn(),
  useDashboardAlertRealtimeRefresh: jest.fn(),
  useAlertAnalysis: () => ({ high: 0 }),
}))

jest.mock('@/features/dashboard/components/StatsGrid', () => ({
  StatsGrid: () => <div />,
}))
jest.mock('@/features/dashboard/components/ActiveAlertsCard', () => ({
  ActiveAlertsCard: () => <div />,
}))
jest.mock('@/features/dashboard/components/QuickActionsCard', () => ({
  QuickActionsCard: () => <div />,
}))
jest.mock('@/features/dashboard/api/dashboard.api', () => ({
  saveTopologyLayout: jest.fn(),
}))

// Alerts mocks
const mockUseAlertsSpy = jest.fn()
jest.mock('@/features/alerts/hooks/useAlerts', () => ({
  useAlerts: (params: unknown) => {
    mockUseAlertsSpy(params)
    return {
      alerts: [],
      loading: false,
      error: null,
      pagination: { page: 1, pageSize: 20, total: 0, hasNext: false, hasPrev: false },
      handleAcknowledgeAlert: jest.fn(),
      handleResolveAlert: jest.fn(),
      handleDeleteAlert: jest.fn(),
      performBulkAction: jest.fn(),
      loadAlerts: jest.fn(),
    }
  },
  useAlertStats: () => ({ stats: null, loading: false, error: null, loadStats: jest.fn() }),
  useAlertFilters: () => ({
    filters: { searchQuery: '', severityFilter: 'all', statusFilter: 'active', excludeQuery: '' },
    updateFilter: jest.fn(),
    resetFilters: jest.fn(),
    debouncedExcludeQuery: '',
    excludeKeywords: [],
  }),
}))

jest.mock('@/features/alerts/components/AlertDetailModal', () => ({
  AlertDetailModal: ({ open, alertId }: { open: boolean; alertId: string }) =>
    open ? <div data-testid="alert-detail-modal">{alertId}</div> : null,
}))
jest.mock('@/features/alerts/components/AlertStatsGrid', () => ({
  AlertStatsGrid: () => null,
}))
jest.mock('@/features/alerts/components/AlertFiltersBar', () => ({
  AlertFiltersBar: () => <div />,
}))
jest.mock('@/features/alerts/components/AlertList', () => ({
  AlertList: () => <div />,
}))
jest.mock('@/features/alerts/components/AlertTimeRangeFilter', () => ({
  AlertTimeRangeFilter: () => <div />,
  ALERT_TIME_RANGE_FILTER_STORAGE_KEY: 'alert_time_range_filter',
}))

jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => ({ subscribeToAlerts: () => jest.fn() }),
  useWebSocketEvent: jest.fn(),
  WebSocketEvents: {
    CONNECT: 'connect',
    NEW_ALERT: 'new_alert',
    ALERT_UPDATE: 'alert_update',
    ALERT_RESOLVED: 'alert_resolved',
    INSPECTION_PROGRESS: 'inspection_progress',
    INSPECTION_COMPLETE: 'inspection_complete',
  },
  wsManager: {
    subscribeToInspectionTasks: jest.fn(),
    unsubscribeFromInspectionTasks: jest.fn(),
  },
}))

// Inspection mocks
const mockUseInspectionExecutions = jest.fn()
const mockBatchDeleteMutateAsync = jest.fn()
let mockInspectionExecutionsItems: Array<{
  id: string
  strategyName: string
  status: string
  progress: number
  completedDevices: number
  totalDevices: number
  triggerType: string
  triggerUser: string
  startTime: string
  duration: number
  summary: {
    score: number
    passedChecks: number
    totalChecks: number
    failedChecks: number
    warningChecks: number
  }
}> = []

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionStats: () => ({ data: null, isLoading: false, error: null, refetch: jest.fn() }),
  useInspectionExecutions: (params: unknown) => {
    mockUseInspectionExecutions(params)
    return {
      data: {
        items: mockInspectionExecutionsItems,
        total: mockInspectionExecutionsItems.length,
        pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    }
  },
  useStopExecution: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGenerateReport: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteExecution: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useBatchDeleteExecutions: () => ({ mutateAsync: mockBatchDeleteMutateAsync, isPending: false }),
}))

jest.mock('@/features/inspection/components/InspectionStrategies', () => ({
  InspectionStrategies: () => <div data-testid="inspection-strategies-tab" />,
}))
jest.mock('@/features/inspection/components/InspectionTemplates', () => ({
  InspectionTemplates: () => <div data-testid="inspection-templates-tab" />,
}))
jest.mock('@/features/inspection/components/InspectionAnalytics', () => ({
  InspectionAnalytics: () => <div data-testid="inspection-analytics-tab" />,
}))
jest.mock('@/features/inspection/components/ExecutionDetailModal', () => ({
  ExecutionDetailModal: () => null,
}))

jest.mock('@/hooks/useDatetimePreferencesSync', () => ({
  useDisplayPreferences: () => ({ data: undefined }),
}))

describe('跨页深链 URL 参数解析（5 处）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    mockInspectionExecutionsItems = []
    mockBatchDeleteMutateAsync.mockResolvedValue({ deletedCount: 1 })
    ;(fetchDeviceStats as jest.Mock).mockResolvedValue({
      total_devices: 0,
      online_devices: 0,
      offline_devices: 0,
      alerting_devices: 0,
      total_alerts: 0,
    })
  })

  it('1. /devices?deviceId=42 自动打开详情弹窗且关闭后不死循环；无效参数忽略', async () => {
    mockSearchParams = new URLSearchParams('deviceId=42')
    ;(fetchDevice as jest.Mock).mockResolvedValue({ id: 42, name: 'core-sw-42' })

    render(<DeviceManagementView />)

    await waitFor(() => {
      expect(fetchDevice).toHaveBeenCalledTimes(1)
      expect(fetchDevice).toHaveBeenCalledWith(42)
    })
    expect(await screen.findByTestId('device-details-modal')).toHaveTextContent('42:core-sw-42')

    fireEvent.click(screen.getByRole('button', { name: '关闭详情' }))
    expect(screen.queryByTestId('device-details-modal')).not.toBeInTheDocument()
    expect(fetchDevice).toHaveBeenCalledTimes(1)

    jest.clearAllMocks()
    mockSearchParams = new URLSearchParams('deviceId=abc')
    render(<DeviceManagementView />)
    await waitFor(() => {
      expect(fetchDeviceStats).toHaveBeenCalled()
    })
    expect(fetchDevice).not.toHaveBeenCalled()
  })

  it('2. /dashboard?focusDevice=2 高亮并选中拓扑节点；不存在节点安全忽略', async () => {
    mockSearchParams = new URLSearchParams('focusDevice=2')
    const { unmount } = render(<DashboardView />)

    const node2 = await screen.findByRole('button', { name: '设备节点 agg-02' })
    expect(node2).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('topology-node-detail')).toHaveTextContent('agg-02')
    unmount()

    // 不存在的节点 ID 安全忽略不报错
    render(
      <NetworkOverviewCard
        overview={[]}
        topology={{
          nodes: [
            {
              id: 1,
              name: 'core-01',
              ip: '10.0.0.1',
              deviceType: 'switch',
              vendor: '',
              model: '',
              firmwareVersion: '',
              status: 'online',
              unmanagedNeighbors: 0,
            },
          ],
          links: [],
        }}
        focusDeviceId={999}
      />,
    )
    expect(screen.getByRole('button', { name: '设备节点 core-01' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('3. /alerts?device_id=12&id=alert-9 同时支持按设备筛选并保留 ?id= 弹窗', async () => {
    mockSearchParams = new URLSearchParams('device_id=12&id=alert-9')
    render(<AlertsView />)

    expect(await screen.findByTestId('alert-detail-modal')).toHaveTextContent('alert-9')
    expect(mockUseAlertsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deviceIds: ['12'],
      }),
    )
    expect(screen.getByText('设备 #12')).toBeInTheDocument()
  })

  it('4. /inspection?device_id=7 解析 device_id，切到执行历史并透传给巡检 API', async () => {
    mockSearchParams = new URLSearchParams('device_id=7')

    const { result } = renderHook(() => useURLFilters())
    expect(result.current.filters.deviceId).toBe('7')
    expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('device_id=7'), { scroll: false })

    render(<InspectionView />)
    await waitFor(() => {
      expect(mockUseInspectionExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 7 }),
      )
    })

    const getSpy = jest.spyOn(api, 'get').mockResolvedValue({
      code: 200,
      data: { items: [], total: 0, pages: 1 },
    })
    await fetchInspectionExecutions({ page: 1, pageSize: 20, deviceId: 7 })
    expect(getSpy).toHaveBeenCalledWith('/inspection/executions?page=1&page_size=20&device_id=7')
    getSpy.mockRestore()

    act(() => {
      result.current.resetFilters()
    })
    expect(result.current.filters.deviceId).toBe('')
  })

  it('4b. /inspection?device_id=7 在全选筛选批量删除时必须透传 deviceId，防误删其他设备记录', async () => {
    mockSearchParams = new URLSearchParams('device_id=7')
    mockInspectionExecutionsItems = [
      {
        id: 'exec-dev-7',
        strategyName: '设备7专项巡检',
        status: 'completed',
        progress: 100,
        completedDevices: 1,
        totalDevices: 1,
        triggerType: 'manual',
        triggerUser: 'admin',
        startTime: '2026-11-20T10:00:00Z',
        duration: 30,
        summary: {
          score: 98,
          passedChecks: 5,
          totalChecks: 5,
          failedChecks: 0,
          warningChecks: 0,
        },
      },
    ]

    render(<InspectionExecutions />)

    const [, rowCheckbox] = screen.getAllByRole('checkbox')
    fireEvent.click(rowCheckbox)
    fireEvent.click(screen.getByRole('button', { name: '全选筛选结果' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mockBatchDeleteMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          selectAllFiltered: true,
          deviceId: '7',
        }),
      )
    })

    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      code: 200,
      data: { deletedCount: 1 },
    })
    await batchDeleteInspectionExecutions({ selectAllFiltered: true, deviceId: '7' })
    expect(postSpy).toHaveBeenCalledWith(
      '/inspection/executions/batch-delete',
      expect.objectContaining({ selectAllFiltered: true, deviceId: '7' }),
    )
    postSpy.mockRestore()
  })

  it('5. /logs?device_id=9&level=error 初始化设备与白名单级别；非法参数安全忽略', () => {
    mockSearchParams = new URLSearchParams('device_id=9&level=ERROR')
    const { result } = renderHook(() => useLogFilters())

    expect(result.current.filters.deviceId).toBe(9)
    expect(result.current.filters.levelFilter).toBe('error')
    expect(result.current.queryParams).toEqual({
      device_id: 9,
      level: 'error',
    })

    mockSearchParams = new URLSearchParams('device_id=-1&level=unknown_level')
    const { result: invalidResult } = renderHook(() => useLogFilters())
    expect(invalidResult.current.filters.deviceId).toBeUndefined()
    expect(invalidResult.current.filters.levelFilter).toBe('all')
    expect(invalidResult.current.queryParams).toEqual({})
  })
})
