import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { StatisticsReports } from '@/features/reports/components/StatisticsReports'
import { Permission } from '@/lib/types/auth.types'
import { formatDateYMD } from '@/utils/formatters'

const mockUsePermission = jest.fn()
const mockUseStatistics = jest.fn()
const mockUseKPIData = jest.fn()
const mockUseRankings = jest.fn()
const mockGenerate = jest.fn()
const mockExport = jest.fn()
const mockDownloadWithAuth = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: Permission) => mockUsePermission(permission),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useStatistics: (...args: unknown[]) => mockUseStatistics(...args),
  useKPIData: (...args: unknown[]) => mockUseKPIData(...args),
  useRankings: (...args: unknown[]) => mockUseRankings(...args),
  useGenerateStatisticsReport: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockGenerate(...args),
  }),
  useExportToExcel: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockExport(...args),
  }),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: (...args: unknown[]) => mockDownloadWithAuth(...args),
}))

jest.mock('@/components/atoms', () => {
  const actual = jest.requireActual('@/components/atoms')
  const passthrough = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  return {
    ...actual,
    Card: passthrough,
    CardHeader: passthrough,
    CardTitle: passthrough,
    CardContent: passthrough,
    Button: ({
      children,
      onClick,
      disabled,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    CardSkeleton: () => <div data-testid="card-skeleton" />,
    ChartSkeleton: () => <div />,
    TableSkeleton: () => <div />,
    ErrorAlert: ({ title, message }: { title?: string; message: string }) => (
      <div>
        {title ? <div>{title}</div> : null}
        <div>{message}</div>
      </div>
    ),
    // 图表组件只回显关键 props，便于断言数据推导，不渲染真实 SVG
    BarChartComponent: ({
      data,
      bars,
    }: {
      data: Array<{ name: string }>
      bars: Array<{ key: string }>
    }) => (
      <div data-testid="bar-chart">
        {JSON.stringify({ names: data.map((row) => row.name), bars: bars.map((bar) => bar.key) })}
      </div>
    ),
    PieChartComponent: ({ data }: { data: Array<{ name: string; value: number }> }) => (
      <div data-testid="pie-chart">{JSON.stringify(data.map((item) => [item.name, item.value]))}</div>
    ),
  }
})

// ==================== 夹具 ====================

const today = formatDateYMD(new Date())
const defaultStart = formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
/** YYYY-MM-DD → MM/DD，与 SmartDateRangePicker 触发按钮的紧凑显示一致 */
const short = (ymd: string) => ymd.slice(5).replace('-', '/')

const fullDistribution = {
  byType: { switch: 2, router: 1 },
  byLocation: { A区: 2, B区: 1 },
  byGroup: {},
  byStatus: { online: 2, offline: 1, warning: 0 },
  byTypeStatus: { switch: { online: 1, offline: 1 }, router: { online: 1 } },
}

/** 模拟后端按筛选条件过滤后的分布：只剩被选中的那一项 */
const filteredDistribution = {
  byType: { switch: 2 },
  byLocation: { A区: 2 },
  byGroup: {},
  byStatus: { online: 1, offline: 1 },
  byTypeStatus: { switch: { online: 1, offline: 1 } },
}

const buildStats = (distribution = fullDistribution) => ({
  overview: {
    totalDevices: 4,
    activeDevices: 3,
    offlineDevices: 1,
    warningDevices: 0,
    errorDevices: 1,
    avgUptime: 99,
    totalExecutions: 12,
    avgScore: 88.5,
  },
  deviceDistribution: distribution,
  performanceStats: {
    byDevice: [
      { metrics: { availability: 100 } },
      { metrics: { availability: 85 } },
      { metrics: { availability: 70 } },
      { metrics: { availability: 50 } },
    ],
    aggregated: {},
  },
  complianceStats: { overallCompliance: 0, byCategory: {}, failedChecks: [] },
  historicalComparison: { currentPeriod: {}, previousPeriod: {}, changes: {} },
})

const rankings = [
  { deviceId: 7, metrics: { availability: 99 }, ranking: 98.4 },
  { deviceName: '核心交换机', deviceType: 'switch', metrics: { availability: 96 }, ranking: 90 },
  { deviceName: '边缘路由器', device_type: 'router', metrics: { availability: 80 }, ranking: 60 },
]

const lastArg = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0]

const queryResult = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: jest.fn() })

const openDatePicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '日期范围选择器' }))
  return screen.getByRole('dialog', { name: '日期范围选择面板' })
}

/** 从日历标题「YYYY年MM月」解析出当前展示的年月 */
const readCalendarMonth = () => {
  const label = screen.getByText(/^\d{4}年\d{2}月$/).textContent ?? ''
  const [, year, month] = label.match(/^(\d{4})年(\d{2})月$/) ?? []
  return { year: Number(year), month: Number(month) }
}

/** 模拟后端：带了位置/类型筛选就只返回被筛中的那一项 */
const statsFollowingFilters = (params: { locations?: string[]; deviceTypes?: string[] }) =>
  queryResult(
    buildStats(
      params?.locations?.length || params?.deviceTypes?.length ? filteredDistribution : fullDistribution
    )
  )

describe('StatisticsReports 全量功能', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockUseStatistics.mockImplementation(() => queryResult(buildStats()))
    mockUseKPIData.mockImplementation(() =>
      queryResult({
        inspection_completion_rate_change: '+0%',
        device_availability_change: '+2.5%',
        avg_health_score_change: '-1.2',
        severe_issue_count_change: '+3',
      })
    )
    mockUseRankings.mockImplementation(() => queryResult(rankings))
    mockGenerate.mockResolvedValue({
      id: 'r1',
      title: '统计报表_x',
      format: 'pdf',
      downloadUrl: '/downloads/r1.pdf',
    })
    mockExport.mockResolvedValue(undefined)
    mockDownloadWithAuth.mockResolvedValue(undefined)
  })

  // ==================== KPI 卡片 ====================

  it('KPI 卡片：数值按总览计算，箭头反映方向、配色反映好坏', () => {
    render(<StatisticsReports searchText="" />)

    const values = Array.from(document.querySelectorAll('[data-slot="stat-value"]')).map(
      (node) => node.textContent
    )
    expect(values).toEqual(['4', '75.0%', '88.5', '25.0%'])

    // 在线率上升是好事 → 上箭头 + 正面色
    expect(screen.getByText(/↗ \+2\.5%/)).toHaveClass('text-success')
    // 评分下降是坏事 → 下箭头 + 负面色
    expect(screen.getByText(/↘ -1\.2/)).toHaveClass('text-destructive')
    // 严重问题数上升是坏事 → 箭头照实向上，但配负面色
    expect(screen.getByText(/↗ \+3/)).toHaveClass('text-destructive')
    expect(screen.getByText('严重问题数 vs 上期')).toBeInTheDocument()
  })

  // ==================== 分布图表 ====================

  it('分布图表：类型分布按真实「类型 × 状态」堆叠，状态/性能饼图剔除零值并闭区间归档', () => {
    render(<StatisticsReports searchText="" />)

    expect(screen.getByTestId('bar-chart')).toHaveTextContent(
      JSON.stringify({ names: ['交换机', '路由器'], bars: ['offline', 'online'] })
    )

    const [statusPie, performancePie] = screen.getAllByTestId('pie-chart')
    // warning: 0 必须被剔除
    expect(statusPie).toHaveTextContent(JSON.stringify([['在线', 2], ['离线', 1]]))
    // 可用性恰为 100 必须落入「优秀」而不是被丢弃
    expect(performancePie).toHaveTextContent(
      JSON.stringify([['优秀', 1], ['良好', 1], ['一般', 1], ['较差', 1]])
    )
  })

  // ==================== 排名表 ====================

  it('性能排名表：按可用性分级，缺名设备回退为 Device-<id>', () => {
    render(<StatisticsReports searchText="" />)

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('#1')
    expect(rows[0]).toHaveTextContent('Device-7')
    expect(rows[0]).toHaveTextContent('99.0%')
    expect(rows[0]).toHaveTextContent('优秀')
    expect(rows[1]).toHaveTextContent('核心交换机')
    expect(rows[1]).toHaveTextContent('交换机')
    expect(rows[1]).toHaveTextContent('良好')
    expect(rows[2]).toHaveTextContent('边缘路由器')
    expect(rows[2]).toHaveTextContent('一般')
  })

  // ==================== 搜索 ====================

  it('搜索关键词同时作用于三张图表与排名表', () => {
    render(<StatisticsReports searchText="核心" />)

    expect(screen.getByText('核心交换机')).toBeInTheDocument()
    expect(screen.queryByText('Device-7')).not.toBeInTheDocument()
    expect(screen.queryByText('边缘路由器')).not.toBeInTheDocument()
    // 三张图表的名称都不含「核心」→ 全部空态
    expect(screen.getAllByText('暂无数据')).toHaveLength(3)
  })

  // ==================== 日期范围 ====================

  it('默认近 30 天：区间同步透传给统计、KPI、排名三个查询，并显示在日期按钮上', () => {
    render(<StatisticsReports searchText="" />)

    expect(lastArg(mockUseStatistics)).toMatchObject({
      startDate: defaultStart,
      endDate: today,
      groupBy: 'day',
      includeTrends: true,
    })
    expect(lastArg(mockUseKPIData)).toMatchObject({
      startDate: defaultStart,
      endDate: today,
      comparisonPeriod: 'previous_period',
    })
    expect(lastArg(mockUseRankings)).toMatchObject({
      startDate: defaultStart,
      endDate: today,
      rankingType: 'performance',
      topN: 10,
    })

    const trigger = screen.getByRole('button', { name: '日期范围选择器' })
    expect(trigger).toHaveTextContent(short(defaultStart))
    expect(trigger).toHaveTextContent(short(today))
  })

  it('快速选择「今天」后三个查询同步切换', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    await user.click(screen.getByRole('button', { name: '今天' }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ startDate: today, endDate: today })
      expect(lastArg(mockUseKPIData)).toMatchObject({ startDate: today, endDate: today })
      expect(lastArg(mockUseRankings)).toMatchObject({ startDate: today, endDate: today })
    })
  })

  it('筛选生效后工具栏不再渲染「已应用 N 个筛选」徽章与「重置筛选」按钮', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    await user.click(screen.getByRole('button', { name: '今天' }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ startDate: today, endDate: today })
    })
    // 这两个元素随筛选出现/消失，会把右对齐的工具栏挤变形；已移除，此处防止回潮
    expect(screen.queryByText(/已应用 \d+ 个筛选/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重置筛选' })).not.toBeInTheDocument()
  })

  it('日历手动点选：先选起点再选终点，区间透传给查询', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    const { year, month } = readCalendarMonth()
    const mm = String(month).padStart(2, '0')

    await user.click(screen.getByRole('button', { name: `${year}年${month}月1日` }))
    await user.click(screen.getByRole('button', { name: `${year}年${month}月2日` }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({
        startDate: `${year}-${mm}-01`,
        endDate: `${year}-${mm}-02`,
      })
    })
  })

  it('只选了起点时查询不应带着残缺区间发出，而应回落到默认近 30 天', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    const { year, month } = readCalendarMonth()
    await user.click(screen.getByRole('button', { name: `${year}年${month}月1日` }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ startDate: defaultStart, endDate: today })
      expect(lastArg(mockUseKPIData)).toMatchObject({ startDate: defaultStart, endDate: today })
      expect(lastArg(mockUseRankings)).toMatchObject({ startDate: defaultStart, endDate: today })
    })
  })

  it('触发按钮上的「清除日期范围」应真正清空日历，查询回落到默认近 30 天', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    await user.click(screen.getByRole('button', { name: '今天' }))
    await user.click(screen.getByRole('button', { name: '清除日期范围' }))

    const trigger = screen.getByRole('button', { name: '日期范围选择器' })
    // 清除后应显示占位文案而不是任何日期
    expect(trigger).toHaveTextContent('日期')
    expect(trigger).not.toHaveTextContent('→')
    expect(screen.queryByRole('button', { name: '清除日期范围' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ startDate: defaultStart, endDate: today })
      expect(lastArg(mockUseKPIData)).toMatchObject({ startDate: defaultStart, endDate: today })
      expect(lastArg(mockUseRankings)).toMatchObject({ startDate: defaultStart, endDate: today })
    })
  })

  it('面板底部的「清除日期」与触发按钮上的清除行为一致', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    await user.click(screen.getByRole('button', { name: '今天' }))
    await user.click(screen.getByRole('button', { name: '清除日期' }))

    const trigger = screen.getByRole('button', { name: '日期范围选择器' })
    expect(trigger).toHaveTextContent('日期')
    expect(trigger).not.toHaveTextContent('→')
    expect(screen.queryByRole('dialog', { name: '日期范围选择面板' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ startDate: defaultStart, endDate: today })
    })
  })

  // ==================== 设备类型 / 位置筛选 ====================

  it('选中设备位置后，下拉选项不应随被过滤的结果收缩', async () => {
    const user = userEvent.setup()
    mockUseStatistics.mockImplementation(statsFollowingFilters)
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '筛选设备位置' }))
    await user.click(screen.getByRole('button', { name: 'A区' }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ locations: ['A区'] })
    })
    // 后端按位置过滤后 by_location 只剩 A区，但用户还应能继续勾选 B区
    expect(screen.getByRole('button', { name: 'B区' })).toBeInTheDocument()
  })

  it('选中设备类型后，下拉选项不应随被过滤的结果收缩', async () => {
    const user = userEvent.setup()
    mockUseStatistics.mockImplementation(statsFollowingFilters)
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '筛选设备类型' }))
    await user.click(screen.getByRole('button', { name: '交换机' }))

    await waitFor(() => {
      expect(lastArg(mockUseStatistics)).toMatchObject({ deviceTypes: ['switch'] })
    })
    expect(screen.getByRole('button', { name: '路由器' })).toBeInTheDocument()
  })

  // ==================== 导出 / 生成 ====================

  it('导出数据：按当前区间命名并输出四张工作表', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '导出数据' }))

    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1))
    const payload = mockExport.mock.calls[0][0]
    expect(payload.title).toBe(`统计报表_${defaultStart}_${today}`)
    expect(payload.sheets.map((sheet: { name: string }) => sheet.name)).toEqual([
      '概览KPI',
      '设备类型分布',
      '性能分布',
      '设备排行',
    ])
    expect(payload.sheets[3].data).toHaveLength(3)
    expect(payload.sheets[3].data[0]).toMatchObject({ rank: 1, name: 'Device-7', status: '优秀' })
  })

  it('生成统计报表：成功后按返回地址下载并提示', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '生成统计报表' }))

    await waitFor(() =>
      expect(mockDownloadWithAuth).toHaveBeenCalledWith('/downloads/r1.pdf', '统计报表_x.pdf')
    )
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: `统计报表_${defaultStart}_${today}`,
        startDate: defaultStart,
        endDate: today,
        format: 'pdf',
      })
    )
    expect(toast.success).toHaveBeenCalledWith('统计报表已生成并开始下载')
  })

  it('生成统计报表失败时，错误提示由 mutation hook 统一处理，组件不应再弹一次', async () => {
    const user = userEvent.setup()
    mockGenerate.mockRejectedValue(new Error('后端不可用'))
    render(<StatisticsReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '生成统计报表' }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('「本周」按周一起算、「本月」按 1 号起算，与共享口径一致', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    await openDatePicker(user)
    await user.click(screen.getByRole('button', { name: '本周' }))

    await waitFor(() => {
      const last = lastArg(mockUseStatistics) as { startDate: string; endDate: string }
      // 周一起算：起点必须是周一（ISO 周口径，与后端 date_trunc('week') 一致）
      expect(new Date(`${last.startDate}T00:00:00`).getDay()).toBe(1)
      expect(last.endDate).toBe(today)
    })

    await user.click(screen.getByRole('button', { name: '本月' }))
    await waitFor(() => {
      const last = lastArg(mockUseStatistics) as { startDate: string; endDate: string }
      expect(last.startDate.endsWith('-01')).toBe(true)
      expect(last.endDate).toBe(today)
    })
  })

  // ==================== 可访问性 / 结构 ====================

  it('日期选择器的清除键是独立按钮，不嵌套在触发按钮内部', async () => {
    const user = userEvent.setup()
    render(<StatisticsReports searchText="" />)

    const trigger = screen.getByRole('button', { name: '日期范围选择器' })
    const clear = screen.getByRole('button', { name: '清除日期范围' })
    // nested-interactive：按钮里不能再有按钮或 role=button
    expect(trigger.querySelector('button, [role="button"]')).toBeNull()
    expect(trigger.contains(clear)).toBe(false)
    expect(clear.tagName).toBe('BUTTON')

    await user.click(clear)
    expect(trigger).toHaveTextContent('日期')
  })

  it('加载中工具栏保持挂载，只有内容区换成骨架屏', () => {
    mockUseKPIData.mockImplementation(() => ({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    }))
    render(<StatisticsReports searchText="" />)

    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索统计报表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '日期范围选择器' })).toBeInTheDocument()
  })

  it('查询出错时工具栏保持挂载，并在内容区显示错误提示', () => {
    mockUseStatistics.mockImplementation(() => ({
      data: null,
      isLoading: false,
      error: new Error('500'),
      refetch: jest.fn(),
    }))
    render(<StatisticsReports searchText="" />)

    expect(screen.getByText('统计数据加载失败')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索统计报表' })).toBeInTheDocument()
  })

  // ==================== 加载 / 错误 ====================

  it('任一查询加载中显示骨架屏', () => {
    mockUseKPIData.mockImplementation(() => ({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    }))
    render(<StatisticsReports searchText="" />)

    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
  })

  it('统计查询出错时显示对应错误提示', () => {
    mockUseStatistics.mockImplementation(() => ({
      data: null,
      isLoading: false,
      error: new Error('500'),
      refetch: jest.fn(),
    }))
    render(<StatisticsReports searchText="" />)

    expect(screen.getByText('统计数据加载失败')).toBeInTheDocument()
  })
})
