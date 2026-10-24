import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    onSelectLog,
  }: {
    onDelete?: (logId: number) => Promise<void> | void
    onSelectLog?: (logId: number) => void
  }) => (
    <div>
      <button type="button" onClick={() => onDelete?.(2)}>
        删除日志 2
      </button>
      <button type="button" onClick={() => onSelectLog?.(2)}>
        勾选日志 2
      </button>
      <button type="button" onClick={() => onSelectLog?.(1)}>
        勾选日志 1
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

  it('勾选日志项后弹出正下方悬浮栏，点击红色删除并在弹窗中确认后触发 batchDeleteLogs 并刷新统计', async () => {
    render(<LogsView />)

    // 初始状态下无选中，不应渲染底部悬浮操作栏
    expect(screen.queryByRole('region', { name: '批量操作栏' })).toBeNull()

    // 勾选日志 2 与日志 1
    fireEvent.click(screen.getByRole('button', { name: '勾选日志 2' }))
    fireEvent.click(screen.getByRole('button', { name: '勾选日志 1' }))

    // 正下方弹出 FloatingBatchActionBar
    const floatingBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(floatingBar).toBeInTheDocument()
    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全选当前页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全选筛选结果' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '反选当前页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消选择' })).toBeInTheDocument()

    // 点击悬浮栏中的删除按钮
    fireEvent.click(within(floatingBar).getByRole('button', { name: '删除' }))

    // 弹出 BatchDeleteConfirmModal
    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText(/确定要批量删除选中的 2 条日志记录吗/)).toBeInTheDocument()

    // 点击弹窗中的「确认删除」
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(batchDeleteLogsMock).toHaveBeenCalledWith([2, 1])
    })

    expect(refreshStatsMock).toHaveBeenCalledTimes(1)

    // 删除成功后选择已清空，悬浮栏收起
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '批量操作栏' })).toBeNull()
    })
  })

  it('全选筛选结果模式下删除应传递 selectAllFiltered 与筛选参数并刷新统计', async () => {
    render(<LogsView />)

    fireEvent.click(screen.getByRole('button', { name: '勾选日志 2' }))
    const floatingBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(floatingBar).toBeInTheDocument()

    // 点击全选筛选结果
    fireEvent.click(screen.getByRole('button', { name: '全选筛选结果' }))
    expect(screen.getByText(/已全选筛选结果/)).toBeInTheDocument()

    // 点击删除
    fireEvent.click(within(floatingBar).getByRole('button', { name: '删除' }))

    // 弹出确认弹窗
    expect(screen.getByText(/确定要删除当前筛选结果中的全部/)).toBeInTheDocument()

    // 点击确认删除
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(batchDeleteLogsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          selectAllFiltered: true,
          excludeIds: [],
        })
      )
    })

    expect(refreshStatsMock).toHaveBeenCalledTimes(1)
  })
})
