import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionAnalytics } from '@/features/inspection/components/InspectionAnalytics'

const mockSharedSelect = jest.fn()

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

jest.mock(
  '@/components/atoms/shared-select',
  () => ({
    SharedSelect: (props: {
      value?: string
      options: Array<{ value: string; label: React.ReactNode }>
      onChange?: (value: string) => void
      ariaLabel?: string
    }) => {
      mockSharedSelect(props)
      return (
        <button
          type="button"
          data-testid="inspection-analytics-shared-select"
          aria-label={props.ariaLabel}
          onClick={() => props.onChange?.('month')}
        >
          {`共享下拉:${props.value}`}
        </button>
      )
    },
  }),
  { virtual: true }
)

describe('InspectionAnalytics 下拉统一化', () => {
  beforeEach(() => {
    mockSharedSelect.mockReset()
    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 10,
        successRate: 95,
        avgScore: 88,
        activeStrategies: 3,
        changes: {
          executionsChange: '1.0%',
          successRateChange: '0.5%',
          avgScoreChange: '0.8%',
          strategiesChange: '1',
        },
      },
      isLoading: false,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useInspectionTrends as jest.Mock).mockReturnValue({
      data: [
        {
          date: '2026-03-01',
          executions: 1,
          success: 1,
          failed: 0,
          avgScore: 90,
        },
      ],
      isLoading: false,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useDeviceDistribution as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useProblemDistribution as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: jest.fn(),
    })
  })

  it('应使用共享 SharedSelect 实现时间周期选择，并保持 period 参数更新', async () => {
    const user = userEvent.setup()
    render(<InspectionAnalytics />)

    expect(screen.getByTestId('inspection-analytics-shared-select')).toBeInTheDocument()
    expect(mockSharedSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 'week',
        ariaLabel: '巡检分析时间周期',
        triggerClassName: expect.stringContaining('h-9'),
        options: [
          { value: 'day', label: '按天' },
          { value: 'week', label: '按周' },
          { value: 'month', label: '按月' },
        ],
      })
    )

    await user.click(screen.getByTestId('inspection-analytics-shared-select'))

    await waitFor(() => {
      const latestCall = (inspectionHooks.useInspectionTrends as jest.Mock).mock.calls.at(-1)
      expect(latestCall?.[0]).toEqual(expect.objectContaining({ period: 'month' }))
    })
  })
})

