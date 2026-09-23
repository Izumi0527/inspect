import React from 'react'
import { render, screen } from '@testing-library/react'
import { InspectionReports } from '@/features/reports/components/InspectionReports'
import type { Report } from '@/features/reports/types'

const mockUseReports = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/features/reports/hooks/useReports', () => ({
  useReports: (...args: unknown[]) => mockUseReports(...args),
  useDeleteReport: () => ({ mutateAsync: jest.fn() }),
  useGenerateInspectionReport: () => ({ isPending: false, mutateAsync: jest.fn() }),
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: jest.fn(),
}))

jest.mock('@/utils/download', () => ({
  downloadWithAuth: jest.fn(),
}))

const buildReport = (id: string, devices: string[]): Report => ({
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
    devices,
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

// 「参数范围」列按落库参数的 device_ids 展示设备数；设备范围缺失（未限定设备，
// 或历史报告的巡检行已删除无从推导）表示「未知 / 不限」，不能渲染成「0 个设备」。
describe('InspectionReports 参数范围的设备数', () => {
  it('记录了设备范围的报告显示实际设备数', () => {
    mockReportList([buildReport('89', ['6'])])

    render(<InspectionReports searchText="" />)

    expect(screen.getByText('1 个设备')).toBeInTheDocument()
  })

  it('设备范围缺失时不显示设备数，而不是显示「0 个设备」', () => {
    mockReportList([buildReport('86', [])])

    render(<InspectionReports searchText="" />)

    expect(screen.getByText('巡检报告 86')).toBeInTheDocument()
    expect(screen.queryByText(/个设备/)).not.toBeInTheDocument()
  })
})
