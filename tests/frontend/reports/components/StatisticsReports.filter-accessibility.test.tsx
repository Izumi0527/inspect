import React from 'react'
import { render, screen } from '@testing-library/react'
import { StatisticsReports } from '@/features/reports/components/StatisticsReports'
import { Permission } from '@/lib/types/auth.types'

const mockUsePermission = jest.fn()
const mockUseStatistics = jest.fn()
const mockUseKPIData = jest.fn()
const mockUseRankings = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: Permission) => mockUsePermission(permission),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useStatistics: (...args: unknown[]) => mockUseStatistics(...args),
  useKPIData: (...args: unknown[]) => mockUseKPIData(...args),
  useRankings: (...args: unknown[]) => mockUseRankings(...args),
  useGenerateStatisticsReport: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useExportToExcel: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

jest.mock('@/components/atoms', () => {
  const actual = jest.requireActual('@/components/atoms')
  return {
    ...actual,
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({
      children,
      onClick,
      disabled,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    CardSkeleton: () => <div />,
    ChartSkeleton: () => <div />,
    TableSkeleton: () => <div />,
    ErrorAlert: ({ title, message }: { title?: string; message: string }) => (
      <div>
        {title ? <div>{title}</div> : null}
        <div>{message}</div>
      </div>
    ),
    BarChartComponent: () => <div>bar-chart</div>,
    PieChartComponent: () => <div>pie-chart</div>,
  }
})

// 不再 mock @/components/shared：本测试需真实 CompactPageToolbar 渲染搜索框与筛选按钮以校验可访问名称。

describe('StatisticsReports 筛选控件可访问性', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockUseStatistics.mockReturnValue({
      data: {
        overview: {
          totalDevices: 2,
          activeDevices: 1,
          offlineDevices: 1,
          warningDevices: 0,
          errorDevices: 0,
          avgUptime: 0,
          totalExecutions: 0,
          avgScore: 0,
        },
        deviceDistribution: {
          byType: { switch: 2 },
          byLocation: { A区: 1, B区: 1 },
          byGroup: {},
          byStatus: {},
        },
        performanceStats: {
          byDevice: [],
          aggregated: {},
        },
        complianceStats: {
          overallCompliance: 0,
          byCategory: {},
          failedChecks: [],
        },
        historicalComparison: {
          currentPeriod: {},
          previousPeriod: {},
          changes: {},
        },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseKPIData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseRankings.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应提供审计日志同款的紧凑搜索框，并为多选筛选器补充稳定可访问名称', () => {
    render(<StatisticsReports searchText="" />)

    const searchInput = screen.getByRole('textbox', { name: '搜索统计报表' })
    const deviceTypeButton = screen.getByRole('button', { name: '筛选设备类型' })
    const locationButton = screen.getByRole('button', { name: '筛选设备位置' })

    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')
    expect(deviceTypeButton).toHaveAttribute('id', 'statistics-device-types')
    expect(locationButton).toHaveAttribute('id', 'statistics-locations')
    expect(deviceTypeButton).toHaveTextContent('设备类型')
    expect(locationButton).toHaveTextContent('设备位置')
  })
})
