import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionAnalytics } from '@/features/inspection/components/InspectionAnalytics'
import { exportAnalyticsReport } from '@/features/inspection/api/inspection.api'

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

jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')

  type SelectContextValue = {
    value?: string
    open: boolean
    setOpen: (open: boolean) => void
    onValueChange?: (value: string) => void
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null)

  const useSelectContext = () => {
    const context = React.useContext(SelectContext)
    if (!context) {
      throw new Error('Select mock context is missing')
    }
    return context
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => {
      const [open, setOpen] = React.useState(false)
      return (
        <SelectContext.Provider value={{ value, open, setOpen, onValueChange }}>
          <div>{children}</div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          {...props}
        >
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = useSelectContext()
      return open ? <div role="listbox">{children}</div> : null
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string
      children: React.ReactNode
    }) => {
      const { value: currentValue, onValueChange, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="option"
          aria-selected={currentValue === value}
          onClick={() => {
            onValueChange?.(value)
            setOpen(false)
          }}
        >
          {children}
        </button>
      )
    },
  }
})

describe('InspectionAnalytics 统计口径一致性', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 10,
        successRate: 95,
        avgScore: 88,
        activeStrategies: 3,
        recentExecutions: [],
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

  it('应把同一组周期与日期范围参数传给 KPI、趋势图和两个分布图', async () => {
    const user = userEvent.setup()
    render(<InspectionAnalytics />)

    await user.click(screen.getByRole('combobox', { name: '巡检分析时间周期' }))
    await user.click(screen.getByRole('option', { name: '按月' }))

    await waitFor(() => {
      const statsParams = (inspectionHooks.useInspectionStats as jest.Mock).mock.calls.at(-1)?.[0]
      const trendsParams = (inspectionHooks.useInspectionTrends as jest.Mock).mock.calls.at(-1)?.[0]
      const deviceParams = (inspectionHooks.useDeviceDistribution as jest.Mock).mock.calls.at(-1)?.[0]
      const problemParams = (inspectionHooks.useProblemDistribution as jest.Mock).mock.calls.at(-1)?.[0]

      expect(trendsParams).toEqual(expect.objectContaining({
        period: 'month',
        startDate: expect.any(String),
        endDate: expect.any(String),
      }))

      expect(statsParams).toEqual(expect.objectContaining({
        period: 'month',
        startDate: trendsParams.startDate,
        endDate: trendsParams.endDate,
      }))

      expect(deviceParams).toEqual(expect.objectContaining({
        period: 'month',
        startDate: trendsParams.startDate,
        endDate: trendsParams.endDate,
      }))

      expect(problemParams).toEqual(expect.objectContaining({
        period: 'month',
        startDate: trendsParams.startDate,
        endDate: trendsParams.endDate,
      }))
    })
  })

  it('执行次数指标文案应与当前统计字段语义一致', () => {
    render(<InspectionAnalytics />)

    expect(screen.getAllByText('执行次数').length).toBeGreaterThan(0)
    expect(screen.queryByText('总执行次数')).not.toBeInTheDocument()
  })

  it('点击导出报告时应请求 PDF 格式文件', async () => {
    const user = userEvent.setup()
    ;(exportAnalyticsReport as jest.Mock).mockResolvedValue(undefined)

    render(<InspectionAnalytics />)

    await user.click(screen.getByText('导出报告'))

    await waitFor(() => {
      expect(exportAnalyticsReport).toHaveBeenCalledWith(expect.objectContaining({
        period: 'week',
        formatType: 'pdf',
        includeCharts: true,
      }))
    })
  })

  it('KPI 比较基线文案应随时间周期切换', async () => {
    const user = userEvent.setup()
    render(<InspectionAnalytics />)

    expect(screen.getAllByText('vs 上周').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('combobox', { name: '巡检分析时间周期' }))
    await user.click(screen.getByRole('option', { name: '按天' }))

    await waitFor(() => {
      expect(screen.getAllByText('vs 前一日').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('combobox', { name: '巡检分析时间周期' }))
    await user.click(screen.getByRole('option', { name: '按月' }))

    await waitFor(() => {
      expect(screen.getAllByText('vs 上月').length).toBeGreaterThan(0)
    })
  })

  it('生成查询日期时不应依赖 toISOString，避免 UTC 错日', () => {
    const spy = jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('不应依赖 toISOString 生成日期')
    })

    expect(() => render(<InspectionAnalytics />)).not.toThrow()

    spy.mockRestore()
  })

  it('最近执行详情应只展示真实执行记录，并显示精确完成时间', () => {
    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 2,
        successRate: 95,
        avgScore: 88,
        activeStrategies: 3,
        recentExecutions: [
          {
            id: 'exec-1',
            strategyId: 'strategy-1',
            strategyName: '核心巡检策略',
            triggerType: 'manual',
            status: 'completed',
            progress: 100,
            totalDevices: 1,
            completedDevices: 1,
            startTime: '2026-03-30T10:15:00',
            endTime: '2026-03-30T10:20:30',
            duration: 330,
            summary: {
              totalChecks: 12,
              passedChecks: 10,
              failedChecks: 1,
              warningChecks: 1,
              score: 88,
              deviceResults: [],
            },
          },
        ],
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
          executions: 0,
          success: 0,
          failed: 0,
          avgScore: 0,
        },
      ],
      isLoading: false,
      refetch: jest.fn(),
    })

    render(<InspectionAnalytics />)

    expect(screen.getByText('核心巡检策略')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('10:20:30')).toBeInTheDocument()
    expect(screen.queryByText('2026-03-01')).not.toBeInTheDocument()
  })

  it('当前范围没有真实执行记录时，不应回退展示趋势占位行', () => {
    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 0,
        successRate: 0,
        avgScore: 0,
        activeStrategies: 3,
        recentExecutions: [],
        changes: {
          executionsChange: '0.0%',
          successRateChange: '0.0%',
          avgScoreChange: '0.0%',
          strategiesChange: '0',
        },
      },
      isLoading: false,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useInspectionTrends as jest.Mock).mockReturnValue({
      data: [
        {
          date: '2026-03-01',
          executions: 3,
          success: 2,
          failed: 1,
          avgScore: 66,
        },
      ],
      isLoading: false,
      refetch: jest.fn(),
    })

    render(<InspectionAnalytics />)

    expect(screen.getByText('当前筛选范围内暂无已完成的执行记录')).toBeInTheDocument()
    expect(screen.queryByText('2026-03-01')).not.toBeInTheDocument()
  })
})
