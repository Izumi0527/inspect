import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectionReports } from '@/features/reports/components/InspectionReports'
import { Permission } from '@/lib/types/auth.types'
import type { Report } from '@/features/reports/types'

const mockUseReports = jest.fn()
const mockUsePermission = jest.fn()
const mockDeleteAll = jest.fn()

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
  useDeleteReportsByType: () => ({ isPending: false, mutateAsync: (...args: unknown[]) => mockDeleteAll(...args) }),
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

// 「全部删除」是破坏性批量操作：必须只在有 reports:delete 时出现，
// 且必须经过二次确认才会真正调用接口。
describe('InspectionReports 全部删除', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePermission.mockReturnValue(true)
    mockDeleteAll.mockResolvedValue(2)
    mockReportList([buildReport('1'), buildReport('2')])
  })

  it('确认后应调用按类型批量删除接口，并在文案里写明删除范围', async () => {
    const user = userEvent.setup()
    render(<InspectionReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '全部删除' }))

    expect(screen.getByText('确定要删除全部 2 份巡检报告吗？此操作无法撤销。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认全部删除' }))

    expect(mockDeleteAll).toHaveBeenCalledWith('inspection')
  })

  it('取消确认时不应调用删除接口', async () => {
    const user = userEvent.setup()
    render(<InspectionReports searchText="" />)

    await user.click(screen.getByRole('button', { name: '全部删除' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(mockDeleteAll).not.toHaveBeenCalled()
  })

  it('无 reports:delete 权限时不应出现「全部删除」按钮', () => {
    mockUsePermission.mockImplementation(
      (permission: Permission) => permission !== Permission.REPORTS_DELETE
    )

    render(<InspectionReports searchText="" />)

    expect(screen.queryByRole('button', { name: '全部删除' })).not.toBeInTheDocument()
  })

  it('列表为空时「全部删除」应禁用', () => {
    mockReportList([])

    render(<InspectionReports searchText="" />)

    expect(screen.getByRole('button', { name: '全部删除' })).toBeDisabled()
  })
})
