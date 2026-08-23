import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrendAnalysis } from '@/features/reports/components/TrendAnalysis'

const mockUseTrendAnalysis = jest.fn()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useTrendAnalysis: (...args: unknown[]) => mockUseTrendAnalysis(...args),
  useGenerateTrendReport: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Loading: () => <div>loading</div>,
  LineChartComponent: ({
    lines,
  }: {
    lines: Array<{ key: string }>
  }) => <div>{`line-keys:${lines.map((line) => line.key).join(',')}`}</div>,
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

describe('TrendAnalysis 下拉规范收敛', () => {
  beforeEach(() => {
    mockUseTrendAnalysis.mockReset()
    mockUseTrendAnalysis.mockReturnValue({
      data: {
        // 折线图至少需要 2 个数据点才能成图，单点场景另有专门用例覆盖
        metrics: [
          {
            metricName: 'capacity',
            dataPoints: [
              { timestamp: '2026-03-30T10:00:00Z', value: 71.2 },
              { timestamp: '2026-03-31T10:00:00Z', value: 72.5 },
            ],
          },
          {
            metricName: 'errors',
            dataPoints: [
              { timestamp: '2026-03-30T10:00:00Z', value: 5 },
              { timestamp: '2026-03-31T10:00:00Z', value: 3 },
            ],
          },
        ],
        predictions: [],
        alerts: [],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })
  })

  it('应渲染具备可访问名称的时间范围/指标下拉', () => {
    render(<TrendAnalysis searchText="" />)

    expect(screen.getByRole('combobox', { name: '趋势时间范围' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '趋势指标' })).toBeInTheDocument()
  })

  it('应渲染审计日志同款的紧凑搜索框与筛选控件', () => {
    render(
      <TrendAnalysis
        searchText=""
        onSearchTextChange={jest.fn()}
      />
    )

    const searchInput = screen.getByRole('textbox', { name: '搜索趋势分析' })
    expect(searchInput).toHaveClass('pl-10')
    expect(searchInput).toHaveClass('h-9')
    expect(searchInput).toHaveClass('text-sm')
    expect(screen.getByRole('combobox', { name: '趋势时间范围' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '趋势时间范围' })).toHaveClass('text-sm')
    expect(screen.getByRole('combobox', { name: '趋势指标' })).toHaveClass('h-9')
    expect(screen.getByRole('combobox', { name: '趋势指标' })).toHaveClass('text-sm')
  })

  it('切换指标后，应驱动图表线条配置切换', async () => {
    const user = userEvent.setup()
    render(<TrendAnalysis searchText="" />)

    expect(screen.getByText('line-keys:capacity')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '趋势指标' }))
    await user.click(screen.getByRole('option', { name: '错误数' }))

    await waitFor(() => {
      expect(screen.getByText('line-keys:errors')).toBeInTheDocument()
    })
  })

  it('指标下拉不应提供后端无采集数据的「性能」选项', async () => {
    const user = userEvent.setup()
    render(<TrendAnalysis searchText="" />)

    await user.click(screen.getByRole('combobox', { name: '趋势指标' }))

    // performance 映射后端 response_time，该指标当前未采集，恒返回空序列
    expect(screen.queryByRole('option', { name: '性能' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: '容量使用' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CPU使用率' })).toBeInTheDocument()
  })

  it('数据点不足 2 个时，应给出明确提示而不是渲染空白坐标系', () => {
    mockUseTrendAnalysis.mockReturnValue({
      data: {
        metrics: [
          {
            metricName: 'capacity',
            dataPoints: [{ timestamp: '2026-03-31T10:00:00Z', value: 72.5 }],
          },
        ],
        predictions: [],
        alerts: [],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<TrendAnalysis searchText="" />)

    expect(screen.getByText('数据点不足，暂时无法呈现趋势')).toBeInTheDocument()
    expect(screen.queryByText(/^line-keys:/)).not.toBeInTheDocument()
  })

  it('切换时间范围后，应触发 useTrendAnalysis 参数更新', async () => {
    const user = userEvent.setup()
    render(<TrendAnalysis searchText="" />)

    const firstCallArg = mockUseTrendAnalysis.mock.calls[0]?.[0]

    await user.click(screen.getByRole('combobox', { name: '趋势时间范围' }))
    await user.click(screen.getByRole('option', { name: '最近30天' }))

    await waitFor(() => {
      const latestCallArg = mockUseTrendAnalysis.mock.calls.at(-1)?.[0]
      expect(latestCallArg?.dateRange?.startDate).toBeDefined()
      expect(latestCallArg?.dateRange?.startDate).not.toEqual(
        firstCallArg?.dateRange?.startDate
      )
    })
  })
})
