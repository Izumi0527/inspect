import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsView } from '@/features/reports/components/ReportsView'

const mockUseReportStats = jest.fn()
const mockReplace = jest.fn()
let mockSearchParams = new URLSearchParams()

jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Input: ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input className={className} {...props} />
  ),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useReportStats: (...args: unknown[]) => mockUseReportStats(...args),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => '/reports',
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}))

jest.mock('@/features/reports/components/InspectionReports', () => ({
  InspectionReports: ({ searchText }: { searchText: string }) => (
    <div>巡检报告内容:{searchText}</div>
  ),
}))

jest.mock('@/features/reports/components/TrendAnalysis', () => ({
  TrendAnalysis: ({ searchText }: { searchText: string }) => (
    <div>趋势分析内容:{searchText}</div>
  ),
}))

jest.mock('@/features/reports/components/StatisticsReports', () => ({
  StatisticsReports: ({ searchText }: { searchText: string }) => (
    <div>统计报表内容:{searchText}</div>
  ),
}))

jest.mock('@/features/reports/components/CustomReports', () => ({
  CustomReports: ({ searchText }: { searchText: string }) => (
    <div>自定义报表内容:{searchText}</div>
  ),
}))

describe('ReportsView', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockReplace.mockReset()
    mockUseReportStats.mockReturnValue({
      data: {
        totalReports: 12,
        generatedToday: 3,
        scheduledReports: 2,
        mostUsedFormat: 'pdf',
      },
      isLoading: false,
    })
  })

  it('不再渲染顶部统计卡片，也不再请求统计数据', () => {
    render(<ReportsView />)

    expect(mockUseReportStats).not.toHaveBeenCalled()
    expect(screen.queryByText('总报表数')).not.toBeInTheDocument()
    expect(screen.queryByText('今日生成')).not.toBeInTheDocument()
    expect(screen.queryByText('定时报表')).not.toBeInTheDocument()
    expect(screen.queryByText('热门格式')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '巡检报告' })).toBeInTheDocument()
    expect(screen.getByText('巡检报告内容:')).toBeInTheDocument()
  })

  it('保留标签切换能力', async () => {
    const user = userEvent.setup()
    render(<ReportsView />)

    await user.click(screen.getByRole('button', { name: '趋势分析' }))

    expect(screen.getByText('趋势分析内容:')).toBeInTheDocument()
  })

  it('点击标签后同步更新 URL 查询参数，避免刷新后回到旧标签', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('tab=custom')

    render(<ReportsView />)

    expect(screen.getByText('自定义报表内容:')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '巡检报告' }))

    expect(screen.getByText('巡检报告内容:')).toBeInTheDocument()
    expect(mockReplace).toHaveBeenCalledWith('/reports?tab=inspection')
  })

  it('报表搜索框应提供稳定的 name 属性，避免浏览器上报表单字段缺失标识', () => {
    render(<ReportsView />)

    expect(screen.getByPlaceholderText('搜索报表...')).toHaveAttribute('name', 'reports-search')
  })

  it('报表搜索框应绑定显式标签，避免浏览器上报无标签字段', () => {
    render(<ReportsView />)

    const label = screen.getByText('搜索报表', { selector: 'label' })
    expect(label).toHaveAttribute('for', 'reports-search-input')
    expect(screen.getByLabelText('搜索报表')).toHaveAttribute('id', 'reports-search-input')
  })
})
