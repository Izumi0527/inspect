import React from 'react'
import { render, screen } from '@testing-library/react'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionAnalytics } from '@/features/inspection/components/InspectionAnalytics'

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTrends: jest.fn(),
  useInspectionStats: jest.fn(),
  useDeviceDistribution: jest.fn(),
  useProblemDistribution: jest.fn(),
}))

jest.mock('@/features/inspection/api/inspection.api', () => ({
  exportAnalyticsReport: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    loading: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/components/shared', () => ({
  CompactPageToolbar: ({
    layout,
    filters,
    secondaryActions,
    primaryActions,
    testIdPrefix,
  }: {
    layout?: string
    filters?: React.ReactNode
    secondaryActions?: Array<{ key: string; label: string }>
    primaryActions?: Array<{ key: string; label: string }>
    testIdPrefix?: string
  }) => (
    <div data-testid={`${testIdPrefix ?? 'toolbar'}-${layout ?? 'end'}-group`}>
      <div>{filters}</div>
      <div>
        {secondaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
        {primaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
      </div>
    </div>
  ),
  CompactStatCard: ({
    title,
    value,
  }: {
    title: string
    value: React.ReactNode
  }) => (
    <div>
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
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
  LineChartComponent: () => <div>LineChartComponent</div>,
  AreaChartComponent: () => <div>AreaChartComponent</div>,
  PieChartComponent: () => <div>PieChartComponent</div>,
}))

describe('InspectionAnalytics 布局统一', () => {
  beforeEach(() => {
    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 12,
        successRate: 96.2,
        avgScore: 88.5,
        activeStrategies: 4,
        changes: {
          executionsChange: '1.0%',
          successRateChange: '0.5%',
          avgScoreChange: '0.8%',
          strategiesChange: '1',
        },
        recentExecutions: [],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useInspectionTrends as jest.Mock).mockReturnValue({
      data: [
        {
          date: '2026-04-01',
          executions: 8,
          success: 7,
          failed: 1,
          avgScore: 91,
        },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useDeviceDistribution as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
    ;(inspectionHooks.useProblemDistribution as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应使用左右均衡工具栏、周期分段器与一体化单行指标条', () => {
    render(<InspectionAnalytics />)

    expect(screen.getByTestId('inspection-analytics-toolbar-between-group')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '巡检分析时间周期' })).toBeInTheDocument()
    expect(screen.getByTestId('analytics-date-range')).toBeInTheDocument()
    expect(screen.getByText('刷新')).toBeInTheDocument()
    expect(screen.getByText('导出报告')).toBeInTheDocument()

    const kpiStrip = screen.getByTestId('analytics-kpi-strip')
    expect(kpiStrip).toBeInTheDocument()
    expect(kpiStrip).toHaveTextContent('执行次数')
    expect(kpiStrip).toHaveTextContent('12')
    expect(kpiStrip).toHaveTextContent('成功率')
    expect(kpiStrip).toHaveTextContent('96.2%')
    expect(kpiStrip).toHaveTextContent('平均评分')
    expect(kpiStrip).toHaveTextContent('88.5')
    expect(kpiStrip).toHaveTextContent('活跃策略')
    expect(kpiStrip).toHaveTextContent('4')
  })
})
