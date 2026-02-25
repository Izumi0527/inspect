import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogsView } from '@/features/logs/components/LogsView'
import { exportLogs } from '@/features/logs/api/logsApi'

jest.mock('@/features/logs/api/logsApi', () => ({
  exportLogs: jest.fn(),
}))

jest.mock('@/features/logs/hooks/useLogs', () => ({
  useLogs: () => ({
    logs: [],
    loading: false,
    error: null,
    pagination: { page: 1, pageSize: 20, total: 0 },
    loadLogs: jest.fn(),
    deleteLog: jest.fn(),
    batchDeleteLogs: jest.fn(),
  }),
  useLogStats: () => ({
    stats: null,
    loading: false,
    refresh: jest.fn(),
  }),
  useLogFilters: () => ({
    filters: {
      searchQuery: 'error',
      levelFilter: 'info',
      facilityFilter: 'system',
      sourceFilter: 'syslog',
      dateRange: { start: '2026-02-24', end: '2026-02-25' },
    },
    updateFilter: jest.fn(),
    resetFilters: jest.fn(),
    queryParams: {},
  }),
  useLogSelection: () => ({
    selectedLogs: [],
    toggleLog: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
  }),
  useLogCollection: () => ({
    collecting: false,
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
  LogList: () => <div>list</div>,
}))

jest.mock('@/features/logs/components/LogDetailModal', () => ({
  LogDetailModal: () => null,
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

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('LogsView 导出', () => {
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL

  beforeEach(() => {
    ;(exportLogs as jest.Mock).mockResolvedValue(new Blob(['csv']))
    window.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url')
    window.URL.revokeObjectURL = jest.fn()
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL
    window.URL.revokeObjectURL = originalRevokeObjectURL
    jest.restoreAllMocks()
  })

  it('点击导出为 CSV 应调用 logsApi.exportLogs 并触发下载', async () => {
    render(<LogsView />)

    fireEvent.click(screen.getByRole('button', { name: /导出为 CSV/i }))

    await waitFor(() => {
      expect(exportLogs).toHaveBeenCalledTimes(1)
    })

    const params = (exportLogs as jest.Mock).mock.calls[0][0] as Record<string, unknown>
    expect(params.format).toBe('csv')
    expect(params.include_raw).toBe(true)
    expect(params.level).toBe('info')
    expect(params.facility).toBe('system')
    expect(params.search).toBe('error')
    expect(params.start_time).toBe('2026-02-24')
    expect(params.end_time).toBe('2026-02-25')

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })
})

