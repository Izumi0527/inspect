import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as inspectionHooks from '@/features/inspection/hooks/useInspection'
import { InspectionAnalytics } from '@/features/inspection/components/InspectionAnalytics'
import { exportAnalyticsReport } from '@/features/inspection/api/inspection.api'
import { ANALYTICS_CHART_UNWRAPPED_CLASS } from '@/features/inspection/utils/analyticsPresentation'
import type { InspectionExecution } from '@/features/inspection/types'

const mockAreaChartProps = jest.fn()
const mockLineChartProps = jest.fn()
const mockPieChartProps = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      whileHover?: unknown
      whileTap?: unknown
    }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

jest.mock('@/features/inspection/hooks/useInspection', () => ({
  useInspectionTrends: jest.fn(),
  useInspectionStats: jest.fn(),
  useDeviceDistribution: jest.fn(),
  useProblemDistribution: jest.fn(),
  useExecutionDetail: jest.fn(),
  useGenerateReport: jest.fn(),
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

jest.mock('@/components/atoms', () => {
  const actual = jest.requireActual('@/components/atoms')
  return {
    ...actual,
    AreaChartComponent: (props: Record<string, unknown>) => {
      mockAreaChartProps(props)
      return <div data-testid="area-chart" className={String(props.className ?? '')} />
    },
    LineChartComponent: (props: Record<string, unknown>) => {
      mockLineChartProps(props)
      return <div data-testid="line-chart" className={String(props.className ?? '')} />
    },
    PieChartComponent: (props: Record<string, unknown>) => {
      mockPieChartProps(props)
      return <div data-testid="pie-chart" className={String(props.className ?? '')} />
    },
  }
})

const completedExecution: InspectionExecution = {
  id: 'exec-99',
  strategyId: '1',
  strategyName: '骨干路由器巡检',
  triggerType: 'scheduled',
  triggerUser: 'system',
  status: 'completed',
  progress: 100,
  totalDevices: 3,
  completedDevices: 3,
  startTime: '2026-11-26T09:00:00Z',
  endTime: '2026-11-26T09:02:05Z',
  duration: 125,
  summary: {
    totalChecks: 15,
    passedChecks: 13,
    warningChecks: 1,
    failedChecks: 1,
    score: 86,
    deviceResults: [],
  },
}

describe('InspectionAnalytics 重设计集成验证', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    ;(inspectionHooks.useInspectionStats as jest.Mock).mockReturnValue({
      data: {
        executionCount: 8,
        successRate: 87.5,
        avgScore: 86.0,
        activeStrategies: 3,
        changes: {
          executionsChange: '+25.0%',
          successRateChange: '-2.5%',
          avgScoreChange: '0.0%',
          strategiesChange: '0',
        },
        recentExecutions: [
          completedExecution,
          {
            ...completedExecution,
            id: 'exec-no-summary',
            strategyName: '缺省摘要测试策略',
            summary: undefined,
          } as unknown as InspectionExecution,
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useInspectionTrends as jest.Mock).mockReturnValue({
      data: [
        { date: '2026-11-19', executions: 3, success: 3, failed: 0, avgScore: 92 },
        { date: '2026-11-26', executions: 5, success: 4, failed: 1, avgScore: 80 },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useDeviceDistribution as jest.Mock).mockReturnValue({
      data: [
        { name: 'switch', value: 4, color: '#5470C6' },
        { name: 'firewall', value: 1, color: '#EE6666' },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useProblemDistribution as jest.Mock).mockReturnValue({
      data: [
        { category: '端口状态', count: 6 },
        { category: 'CPU使用率', count: 4 },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useExecutionDetail as jest.Mock).mockReturnValue({
      data: completedExecution,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    ;(inspectionHooks.useGenerateReport as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
  })

  it('正确渲染真实涨跌箭头、图例与中文分布数据，并去除双层卡片套娃与硬编码色板', () => {
    const { container } = render(<InspectionAnalytics />)

    // 真实涨跌箭头与 CompactStatCard 对应语义色
    const upEl = screen.getByText(/↗ \+25\.0%/)
    const downEl = screen.getByText(/↘ -2\.5%/)
    const flatEl = screen.getByText(/→ 0\.0%/)
    expect(upEl).toHaveClass('text-success')
    expect(downEl).toHaveClass('text-destructive')
    expect(flatEl).toHaveClass('text-muted-foreground')

    // 4 张 KPI 卡片使用原版 CompactStatCard (data-slot="stat-card")，4 张图表卡 + 最近执行面板接入 data-slot="card"
    expect(container.querySelectorAll('[data-slot="stat-card"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(5)

    // 去除双层卡片套娃并透传 CSS 变量语义配色
    expect(screen.getByTestId('area-chart')).toHaveClass(ANALYTICS_CHART_UNWRAPPED_CLASS)
    expect(screen.getByTestId('line-chart')).toHaveClass(ANALYTICS_CHART_UNWRAPPED_CLASS)
    expect(screen.getByTestId('pie-chart')).toHaveClass(ANALYTICS_CHART_UNWRAPPED_CLASS)
    expect(mockAreaChartProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        areas: [
          expect.objectContaining({ key: 'executions', color: 'var(--info)' }),
          expect.objectContaining({ key: 'success', color: 'var(--success)' }),
        ],
      })
    )
    expect(mockLineChartProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ key: 'avgScore', color: 'var(--brand)' })],
      })
    )

    // 静态图例、评分均值摘要、中文设备分布、问题排行
    expect(screen.getByText('总执行')).toBeInTheDocument()
    expect(screen.getByText('成功')).toBeInTheDocument()
    expect(screen.getByText('共 8 次 · 失败 1 次')).toBeInTheDocument()
    expect(screen.getByText('均值 86.0 · 区间 80–92')).toBeInTheDocument()
    expect(screen.getByText('共 5 台')).toBeInTheDocument()
    expect(mockPieChartProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: [
          { name: '交换机', value: 4, color: 'var(--brand)' },
          { name: '防火墙', value: 1, color: 'var(--info)' },
        ],
      })
    )
    expect(screen.getByText('共 10 项')).toBeInTheDocument()
    expect(screen.getByText('端口状态')).toBeInTheDocument()
    expect(screen.getByText('60.0%')).toBeInTheDocument()

    // 缺失 summary 行兜底不崩溃
    expect(screen.getByText('缺省摘要测试策略')).toBeInTheDocument()

    // 图表与最近执行区域保持零硬编码旧调色板
    expect(screen.getByTestId('analytics-charts-section').innerHTML).not.toMatch(
      /purple-|blue-100|green-100|red-100|gray-700|#8B5CF6|#3B82F6/
    )
    expect(screen.getByTestId('analytics-recent-executions').innerHTML).not.toMatch(
      /purple-|blue-100|green-100|red-100|gray-700|#8B5CF6|#3B82F6/
    )
  })

  it('常见问题为空时渲染正向空态，支持点击最近执行记录下钻详情，且导出中禁用防连点', async () => {
    const user = userEvent.setup()
    let resolveExport: (() => void) | undefined
    ;(exportAnalyticsReport as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveExport = resolve
      })
    )
    ;(inspectionHooks.useProblemDistribution as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<InspectionAnalytics />)

    expect(screen.getByText('当前统计周期内暂无异常问题')).toBeInTheDocument()

    // 点击最近执行策略名打开详情弹窗
    await user.click(screen.getByRole('button', { name: '骨干路由器巡检' }))
    expect(screen.getByRole('dialog', { name: '执行详情 - 骨干路由器巡检' })).toBeInTheDocument()
    const closeButtons = screen.getAllByRole('button', { name: '关闭' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 导出防连点禁用态
    const exportBtn = screen.getByRole('button', { name: '导出报告' })
    await user.click(exportBtn)
    const exportingBtn = screen.getByRole('button', { name: '导出中…' })
    expect(exportingBtn).toBeDisabled()
    expect(exportAnalyticsReport).toHaveBeenCalledTimes(1)

    resolveExport?.()
    expect(await screen.findByRole('button', { name: '导出报告' })).toBeEnabled()
  })
})
