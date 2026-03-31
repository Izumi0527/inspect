import React from 'react'
import { render, screen } from '@testing-library/react'
import { TrafficAnalysisView } from '@/features/traffic-analysis/components/TrafficAnalysisView'
import { TrafficAnomaliesPanel } from '@/features/traffic-analysis/components/TrafficAnomaliesPanel'
import { TrafficTrendsChart } from '@/features/traffic-analysis/components/TrafficTrendsChart'

const mockUseTrafficAnalysis = jest.fn()
const mockUseTrafficRealtime = jest.fn()
const mockUseTrafficFilter = jest.fn()

jest.mock('@/features/traffic-analysis/hooks/useTrafficAnalysis', () => ({
  useTrafficAnalysis: () => mockUseTrafficAnalysis(),
  useTrafficRealtime: (...args: unknown[]) => mockUseTrafficRealtime(...args),
  useTrafficFilter: () => mockUseTrafficFilter(),
}))

jest.mock('@/features/traffic-analysis/components/TrafficRealtimeChart', () => ({
  TrafficRealtimeChart: () => <div>TrafficRealtimeChart</div>,
}))

jest.mock('@/features/traffic-analysis/components/TrafficSummaryCards', () => ({
  TrafficSummaryCards: () => <div>TrafficSummaryCards</div>,
}))

jest.mock('@/components/shared', () => ({
  CompactStatCard: ({ title }: { title: string }) => <div>{title}</div>,
}))

jest.mock('@/utils/formatters', () => ({
  formatBytes: (value: number) => `${value}B`,
  formatDate: (value: string) => value,
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Loading: () => <div>Loading</div>,
  LineChartComponent: () => <div>LineChartComponent</div>,
  AreaChartComponent: () => <div>AreaChartComponent</div>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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

describe('traffic-analysis 下拉统一化', () => {
  beforeEach(() => {
    mockUseTrafficAnalysis.mockReturnValue({
      isLoading: false,
      error: null,
      startMonitoring: jest.fn().mockResolvedValue(undefined),
      getTrafficAnomalies: jest.fn().mockResolvedValue([]),
      getTrafficTrends: jest.fn().mockResolvedValue([]),
    })
    mockUseTrafficRealtime.mockReturnValue({
      trafficData: [],
      isActive: false,
      startRealtime: jest.fn(),
      stopRealtime: jest.fn(),
    })
    mockUseTrafficFilter.mockReturnValue({
      filter: {
        time_range: {
          start: '2026-03-01',
          end: '2026-03-02',
        },
      },
    })
  })

  it('TrafficAnalysisView 应为刷新间隔下拉提供明确 aria-label', () => {
    const { container } = render(<TrafficAnalysisView deviceIps={['10.0.0.1']} />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '流量刷新间隔' })).toBeInTheDocument()
  })

  it('TrafficAnomaliesPanel 应为严重程度和异常类型筛选提供明确 aria-label', () => {
    const { container } = render(<TrafficAnomaliesPanel deviceIps={['10.0.0.1']} />)

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '异常严重程度筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '异常类型筛选' })).toBeInTheDocument()
  })

  it('TrafficTrendsChart 应为四个下拉提供明确 aria-label', () => {
    const { container } = render(
      <TrafficTrendsChart
        deviceIps={['10.0.0.1']}
        timeRange={{ start: '2026-03-01', end: '2026-03-02' }}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '流量趋势指标' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '流量图表类型' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '流量趋势设备' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '分析时长' })).toBeInTheDocument()
  })
})
