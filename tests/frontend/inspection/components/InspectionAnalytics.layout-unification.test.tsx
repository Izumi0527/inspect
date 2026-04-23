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
    secondaryActions,
    primaryActions,
    customActions,
    testIdPrefix,
  }: {
    secondaryActions?: Array<{ key: string; label: string }>
    primaryActions?: Array<{ key: string; label: string }>
    customActions?: React.ReactNode
    testIdPrefix?: string
  }) => (
    <div data-testid={`${testIdPrefix ?? 'toolbar'}-end-group`}>
      {secondaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
      {primaryActions?.map((action) => <span key={action.key}>{action.label}</span>)}
      {customActions}
    </div>
  ),
  CompactStatCard: ({
    title,
    value,
  }: {
    title: string
    value: React.ReactNode
  }) => <div>{`${title}:${value}`}</div>,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  BarChartComponent: () => <div>BarChartComponent</div>,
  PieChartComponent: () => <div>PieChartComponent</div>,
}))

jest.mock('@/components/atoms/shared-select', () => ({
  SharedSelect: ({
    ariaLabel,
  }: {
    ariaLabel?: string
  }) => <button type="button" aria-label={ariaLabel}>时间周期</button>,
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

  it('应将操作栏和统计卡片统一到共享页面规格', () => {
    render(<InspectionAnalytics />)

    expect(screen.getByTestId('inspection-analytics-toolbar-end-group')).toBeInTheDocument()
    expect(screen.getByText('刷新')).toBeInTheDocument()
    expect(screen.getByText('导出报告')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '巡检分析时间周期' })).toBeInTheDocument()
    expect(screen.getByText('执行次数:12')).toBeInTheDocument()
    expect(screen.getByText('成功率:96.2%')).toBeInTheDocument()
    expect(screen.getByText('平均评分:88.5')).toBeInTheDocument()
    expect(screen.getByText('活跃策略:4')).toBeInTheDocument()
  })
})
