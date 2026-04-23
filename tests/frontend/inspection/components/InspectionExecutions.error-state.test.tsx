import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionExecutions } from '@/features/inspection/components/InspectionExecutions'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  }),
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionExecutions: jest.fn(),
  useStopExecution: jest.fn(),
  useGenerateReport: jest.fn(),
  useDeleteExecution: jest.fn(),
}))

jest.mock('@/features/inspection/hooks/useURLFilters', () => ({
  useURLFilters: () => ({
    filters: {
      page: 1,
      pageSize: 20,
      status: 'all',
      startDate: '',
      endDate: '',
    },
    updateFilter: jest.fn(),
    resetFilters: jest.fn(),
  }),
}))

jest.mock('@/features/inspection/hooks/useDateFilters', () => ({
  useDateFilters: () => ({
    getDateRange: jest.fn(() => ({ startDate: '', endDate: '' })),
  }),
}))

jest.mock('@/features/inspection/components/ExecutionDetailModal', () => ({
  ExecutionDetailModal: () => null,
}))

jest.mock('@/features/inspection/components/ExecutionStatsCards', () => ({
  ExecutionStatsCards: () => <div>ExecutionStatsCards</div>,
}))

jest.mock('@/features/inspection/components/ExecutionFilters', () => ({
  ExecutionFilters: () => <div data-testid="inspection-executions-filters">ExecutionFilters</div>,
}))

jest.mock('@/features/inspection/components/ExecutionTableSkeleton', () => ({
  ExecutionTableSkeleton: () => <div>ExecutionTableSkeleton</div>,
}))

jest.mock('@/features/inspection/components/ExecutionEmptyState', () => ({
  ExecutionEmptyState: () => <div>ExecutionEmptyState</div>,
}))

jest.mock('@/lib/websocket', () => ({
  useWebSocketEvent: jest.fn(),
  WebSocketEvents: {
    CONNECT: 'connect',
    INSPECTION_PROGRESS: 'inspection_progress',
  },
  wsManager: {
    subscribeToInspectionTasks: jest.fn(),
    unsubscribeFromInspectionTasks: jest.fn(),
  },
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Table: ({ size }: { size?: 'small' | 'default' | 'large' }) => (
    <div data-testid="inspection-executions-table" data-size={size ?? 'default'}>
      Table
    </div>
  ),
  Pagination: () => <div>Pagination</div>,
  Column: () => null,
}))

jest.mock('@/components/atoms/modal', () => ({
  SimpleModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('InspectionExecutions 错误态', () => {
  it('列表加载失败时应展示错误态并允许重试', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn()

    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('执行记录加载失败'),
      refetch,
    })
    ;(inspectionHooks.useStopExecution as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({ isPending: false })

    render(<InspectionExecutions />)

    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.getByText('执行记录加载失败')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('正常态应展示统一筛选栏、统计卡片和默认表格规格', () => {
    ;(inspectionHooks.useInspectionExecutions as jest.Mock).mockReturnValue({
      data: {
        items: [
          {
            id: 'exec-1',
            strategyName: '核心巡检',
            status: 'completed',
            progress: 100,
            completedDevices: 2,
            totalDevices: 2,
            triggerType: 'manual',
            triggerUser: 'admin',
            startTime: '2026-04-23T10:00:00Z',
            duration: 120,
            summary: {
              score: 96,
              passedChecks: 10,
              totalChecks: 10,
              failedChecks: 0,
              warningChecks: 0,
            },
          },
        ],
        total: 1,
        pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useStopExecution as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({ isPending: false })
    ;(inspectionHooks.useDeleteExecution as jest.Mock).mockReturnValue({ isPending: false })

    render(<InspectionExecutions />)

    expect(screen.getByTestId('inspection-executions-filters')).toBeInTheDocument()
    expect(screen.getByText('ExecutionStatsCards')).toBeInTheDocument()
    expect(screen.getByTestId('inspection-executions-table')).toHaveAttribute('data-size', 'default')
  })
})
