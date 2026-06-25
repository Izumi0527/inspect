import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatisticsReports } from '@/features/reports/components/StatisticsReports'
import { Permission } from '@/lib/types/auth.types'

const mockUsePermission = jest.fn()
const mockUseStatistics = jest.fn()
const mockUseKPIData = jest.fn()
const mockUseRankings = jest.fn()
const mockGenerateStatisticsReport = jest.fn()
const mockDownloadWithAuth = jest.fn()
const mockRefetchStats = jest.fn()
const mockRefetchKpi = jest.fn()
const mockRefetchRankings = jest.fn()

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
  useGenerateStatisticsReport: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockGenerateStatisticsReport(...args),
  }),
  useExportToExcel: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: (...args: unknown[]) => mockDownloadWithAuth(...args),
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

// 不再 mock @/components/shared：本测试需真实 CompactPageToolbar 渲染搜索框与筛选按钮以交互。

describe('StatisticsReports 筛选参数透传', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockGenerateStatisticsReport.mockResolvedValue({
      id: 'statistics-report-1',
      title: '统计报表_2026-03-20_2026-04-19',
      format: 'pdf',
      downloadUrl: '/downloads/statistics-report-1.pdf',
    })
    mockDownloadWithAuth.mockResolvedValue(undefined)
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
      refetch: mockRefetchStats,
    })
    mockUseKPIData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetchKpi,
    })
    mockUseRankings.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockRefetchRankings,
    })
  })

  it('设备位置筛选应同步传递给 KPI 和排名查询', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '筛选设备位置' }))
    await user.click(screen.getByRole('button', { name: 'A区' }))

    await waitFor(() => {
      expect(mockUseKPIData).toHaveBeenLastCalledWith(
        expect.objectContaining({
          locations: ['A区'],
          comparisonPeriod: 'previous_period',
        })
      )
      expect(mockUseRankings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          locations: ['A区'],
          rankingType: 'performance',
          topN: 10,
          includeBottom: false,
        })
      )
    })
  })

  it('生成统计报表应携带当前设备类型与位置筛选', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '筛选设备类型' }))
    await user.click(screen.getByRole('button', { name: 'switch' }))
    await user.click(screen.getByRole('button', { name: '筛选设备位置' }))
    await user.click(screen.getByRole('button', { name: 'B区' }))
    await user.click(screen.getByRole('button', { name: '生成统计报表' }))

    await waitFor(() => {
      expect(mockGenerateStatisticsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceTypes: ['switch'],
          locations: ['B区'],
          format: 'pdf',
          includeCharts: true,
          includeTrends: true,
          includeRankings: true,
        })
      )
    })
  })

  it('刷新数据应同时刷新统计、KPI 和排名数据', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '刷新数据' }))

    expect(mockRefetchStats).toHaveBeenCalledTimes(1)
    expect(mockRefetchKpi).toHaveBeenCalledTimes(1)
    expect(mockRefetchRankings).toHaveBeenCalledTimes(1)
  })
})
