import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('InspectionAnalytics 时间周期分段器', () => {
  beforeEach(() => {
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

  it('应使用 h-9 内联时间周期分段器，不再渲染原生 select 或 combobox，并同步更新 period', async () => {
    const user = userEvent.setup()
    const { container } = render(<InspectionAnalytics />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const periodGroup = screen.getByRole('group', { name: '巡检分析时间周期' })
    expect(periodGroup).toBeInTheDocument()
    expect(periodGroup).toHaveClass('h-9')

    const weekBtn = screen.getByRole('button', { name: '按周' })
    const monthBtn = screen.getByRole('button', { name: '按月' })
    expect(weekBtn).toHaveClass('h-7')
    expect(weekBtn).toHaveAttribute('aria-pressed', 'true')
    expect(monthBtn).toHaveAttribute('aria-pressed', 'false')

    await user.click(monthBtn)

    await waitFor(() => {
      const latestCall = (inspectionHooks.useInspectionTrends as jest.Mock).mock.calls.at(-1)
      expect(latestCall?.[0]).toEqual(expect.objectContaining({ period: 'month' }))
    })
    expect(screen.getByRole('button', { name: '按月' })).toHaveAttribute('aria-pressed', 'true')
  })
})
