import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { InspectionReports } from '@/features/reports/components/InspectionReports'
import { Permission } from '@/lib/types/auth.types'
import type { Report } from '@/features/reports/types'

const mockUseReports = jest.fn()
const mockUsePermission = jest.fn()
const mockBatchDelete = jest.fn()

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
      <tr {...props}>{children}</tr>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: Permission) => mockUsePermission(permission),
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useReports: (...args: unknown[]) => mockUseReports(...args),
  useDeleteReport: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useGenerateInspectionReport: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useBatchDeleteReports: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockBatchDelete(...args),
  }),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

const buildReport = (id: string): Report => ({
  id,
  title: `巡检报告 ${id}`,
  description: '',
  type: 'inspection',
  category: 'custom',
  format: 'pdf',
  status: 'completed',
  createdAt: '2026-09-11T04:16:16Z',
  updatedAt: '2026-09-11T04:16:16Z',
  generatedBy: '系统',
  parameters: {
    dateRange: { startDate: '2026-09-10T04:16:16Z', endDate: '2026-09-11T04:16:16Z' },
    includeCharts: true,
    includeDetailData: true,
    includeRecommendations: true,
  },
})

const mockReportList = (reports: Report[]) => {
  mockUseReports.mockReturnValue({
    data: { reports, total: reports.length },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })
}

describe('InspectionReports 批量选择与删除（前置复选框 + 悬浮操作栏）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockBatchDelete.mockResolvedValue({ deletedCount: 2 })
    mockReportList([buildReport('1'), buildReport('2')])
  })

  it('顶部工具栏不再渲染旧版「全部删除」按钮', () => {
    render(<InspectionReports searchText="" />)
    expect(screen.queryByRole('button', { name: '全部删除' })).not.toBeInTheDocument()
  })

  it('有 reports:delete 权限时渲染表头及行复选框，初始不显示底部悬浮操作栏', () => {
    render(<InspectionReports searchText="" />)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBe(3) // 1 表头 + 2 行
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()
  })

  it('勾选记录后弹出 FloatingBatchActionBar，包含全部操作按钮及红色删除按钮', () => {
    render(<InspectionReports searchText="" />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    expect(actionBar).toBeInTheDocument()
    expect(within(actionBar).getByText('已选择 1 项')).toBeInTheDocument()

    expect(within(actionBar).getByRole('button', { name: '全选当前页' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '全选筛选结果' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '反选当前页' })).toBeInTheDocument()
    expect(within(actionBar).getByRole('button', { name: '取消选择' })).toBeInTheDocument()

    const deleteBtn = within(actionBar).getByRole('button', { name: '删除' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.className).toContain('text-red-600')
  })

  it('显式勾选模式下，点击删除弹出 BatchDeleteConfirmModal，确认后调用 batchDeleteReports', async () => {
    render(<InspectionReports searchText="" />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    fireEvent.click(within(actionBar).getByRole('button', { name: '删除' }))

    expect(screen.getByRole('heading', { level: 3, name: '批量删除确认' })).toBeInTheDocument()
    expect(screen.getByText('您确定要批量删除选中的 1 份巡检报告吗？')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledWith({
        selectAllFiltered: false,
        ids: ['1'],
      })
    })
  })

  it('全选筛选结果模式下调用带 selectAllFiltered 的批量删除', async () => {
    render(<InspectionReports searchText="" />)

    const [, row1Checkbox] = screen.getAllByRole('checkbox')
    fireEvent.click(row1Checkbox)

    const actionBar = screen.getByRole('region', { name: '批量操作栏' })
    fireEvent.click(within(actionBar).getByRole('button', { name: '全选筛选结果' }))

    fireEvent.click(within(actionBar).getByRole('button', { name: '删除' }))

    expect(screen.getByText('您确定要删除当前筛选结果中的全部 2 份巡检报告吗？')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledWith({
        selectAllFiltered: true,
        excludeIds: [],
        type: 'inspection',
        status: undefined,
        format: undefined,
        search: undefined,
      })
    })
  })

  it('无 reports:delete 权限时不显示行复选框与底部悬浮操作栏', () => {
    mockUsePermission.mockImplementation(
      (permission: Permission) => permission !== Permission.REPORTS_DELETE
    )

    render(<InspectionReports searchText="" />)

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('region', { name: '批量操作栏' })).not.toBeInTheDocument()
  })
})
