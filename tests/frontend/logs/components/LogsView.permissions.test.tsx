import React from 'react'
import { render, screen } from '@testing-library/react'
import { LogsView } from '@/features/logs/components/LogsView'

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => false,
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
    selectedLogs: [1, 2],
    toggleLog: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
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
  LogFiltersBar: ({ selectedCount }: { selectedCount: number }) => (
    <div>{`selected:${selectedCount}`}</div>
  ),
}))

jest.mock('@/features/logs/components/LogList', () => ({
  LogList: () => <div>list</div>,
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

describe('LogsView 权限分支', () => {
  it('无 system:logs:manage 权限时应隐藏采集/批量入口，且 selectedCount=0', () => {
    render(<LogsView />)

    expect(screen.queryByRole('button', { name: /采集日志/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /批量操作/i })).toBeNull()
    expect(screen.getByText('selected:0')).toBeInTheDocument()
  })
})

