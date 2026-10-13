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

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Loading: () => <span>loading</span>,
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    title?: string
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
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
  SmartDateRangePicker: () => <button type="button">日期范围选择器</button>,
  BarChartComponent: () => <div />,
  PieChartComponent: () => <div />,
}))

jest.mock('@/components/ui/select', () => ({
  MultiSelect: ({
    triggerId,
    ariaLabel,
    placeholder,
  }: {
    triggerId?: string
    ariaLabel?: string
    placeholder?: string
  }) => (
    <button id={triggerId} type="button" aria-label={ariaLabel}>
      {placeholder}
    </button>
  ),
}))

describe('reports 权限控制（P1）', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockUseStatistics.mockReturnValue({
      data: null,
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

  it('无 reports:create 时，统计页不应展示“生成统计报表/导出数据”按钮', () => {
    mockUsePermission.mockReturnValue(false)

    render(<StatisticsReports searchText="" />)

    expect(screen.queryByRole('button', { name: '生成统计报表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出数据' })).not.toBeInTheDocument()
    expect(
      screen.getByText('当前账号暂无生成/导出报表权限，请联系管理员开通。')
    ).toBeInTheDocument()
  })
})
