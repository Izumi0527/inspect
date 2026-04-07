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
})
