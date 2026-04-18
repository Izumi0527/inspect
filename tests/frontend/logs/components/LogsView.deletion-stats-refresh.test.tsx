import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogsView } from '@/features/logs/components/LogsView'

const deleteLogMock = jest.fn()
const batchDeleteLogsMock = jest.fn()
const loadLogsMock = jest.fn()
const refreshStatsMock = jest.fn()
const clearSelectionMock = jest.fn()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/logs',
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/features/logs/hooks/useLogs', () => ({
  useLogs: () => ({
    logs: [
      { id: 2, message: '真实日志验证-警告-002' },
      { id: 1, message: '真实日志验证-错误-001' },
    ],
    loading: false,
    error: null,
    pagination: { page: 1, pageSize: 20, total: 2 },
    loadLogs: loadLogsMock,
    deleteLog: deleteLogMock,
    batchDeleteLogs: batchDeleteLogsMock,
  }),
  useLogStats: () => ({
    stats: { total: 2, error_count: 1, warning_count: 1, device_count: 1 },
    loading: false,
    refresh: refreshStatsMock,
  }),
  useLogFilters: () => ({
    filters: {
      searchQuery: '',
      levelFilter: 'all',
      facilityFilter: 'all',
      sourceFilter: 'all',
      dateRange: { start: '', end: '' },
    },
    updateFilter: jest.fn(),
    resetFilters: jest.fn(),
    queryParams: {},
  }),
  useLogSelection: () => ({
    selectedLogs: [2, 1],
    toggleLog: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: clearSelectionMock,
  }),
  useLogCollection: () => ({
    collecting: false,
    progress: {},
    collectLogs: jest.fn(),
    batchCollect: jest.fn(),
  }),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/logs/components/LogStatsGrid', () => ({
  LogStatsGrid: () => <div>stats</div>,
}))

jest.mock('@/features/logs/components/LogFiltersBar', () => ({
  LogFiltersBar: () => <div>filters</div>,
}))

jest.mock('@/features/logs/components/LogList', () => ({
  LogList: ({
    onDelete,
  }: {
    onDelete?: (logId: number) => Promise<void> | void
  }) => (
    <div>
      <button type="button" onClick={() => onDelete?.(2)}>
        删除日志 2
      </button>
    </div>
  ),
}))

jest.mock('@/features/logs/components/LogDetailModal', () => ({
  LogDetailModal: () => null,
}))

jest.mock('@/features/logs/components/LogCollectionModal', () => ({
  LogCollectionModal: () => null,
}))

jest.mock('@/components/atoms/skeleton', () => ({
  SkeletonCard: () => <div>skeleton-card</div>,
  SkeletonList: () => <div>skeleton-list</div>,
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
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    [key: string]: unknown
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('LogsView 删除后的统计刷新', () => {
  const originalConfirm = global.confirm

  beforeEach(() => {
    deleteLogMock.mockReset()
    batchDeleteLogsMock.mockReset()
    loadLogsMock.mockReset()
    refreshStatsMock.mockReset()
    clearSelectionMock.mockReset()

    deleteLogMock.mockResolvedValue(true)
    batchDeleteLogsMock.mockResolvedValue(true)
    refreshStatsMock.mockResolvedValue(true)
    global.confirm = jest.fn(() => true)
  })

  afterAll(() => {
    global.confirm = originalConfirm
  })

  it('单条删除成功后应刷新统计数据', async () => {
    render(<LogsView />)

    fireEvent.click(screen.getByRole('button', { name: '删除日志 2' }))

    await waitFor(() => {
      expect(deleteLogMock).toHaveBeenCalledWith(2)
    })

    expect(refreshStatsMock).toHaveBeenCalledTimes(1)
  })

  it('批量删除成功后应刷新统计数据并清空选择', async () => {
    render(<LogsView />)

    fireEvent.click(screen.getByRole('button', { name: /批量删除/i }))

    await waitFor(() => {
      expect(batchDeleteLogsMock).toHaveBeenCalledWith([2, 1])
    })

    expect(clearSelectionMock).toHaveBeenCalledTimes(1)
    expect(refreshStatsMock).toHaveBeenCalledTimes(1)
  })
})
