import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportPreviewModal } from '@/features/reports/components/ReportPreviewModal'
import type { Report } from '@/features/reports/types'

const mockGetAccessToken = jest.fn()
const mockDownloadReport = jest.fn()
const mockRerenderReportPdf = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/api-client', () => ({
  getApiOrigin: () => 'http://127.0.0.1:8000',
  TokenManager: {
    getAccessToken: () => mockGetAccessToken(),
  },
}))

jest.mock('@/features/reports/api/reports.api', () => ({
  downloadReport: (...args: unknown[]) => mockDownloadReport(...args),
  rerenderReportPdf: (...args: unknown[]) => mockRerenderReportPdf(...args),
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('ReportPreviewModal', () => {
  const originalCreateObjectURL = window.URL.createObjectURL
  const originalRevokeObjectURL = window.URL.revokeObjectURL

  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
    mockDownloadReport.mockReset()
    mockRerenderReportPdf.mockReset()
    window.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-preview')
    window.URL.revokeObjectURL = jest.fn()
    mockGetAccessToken.mockReturnValue('test-token')
  })

  afterAll(() => {
    window.URL.createObjectURL = originalCreateObjectURL
    window.URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('PDF 报表应加载并渲染 iframe 预览', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    })

    const report: Report = {
      id: '1',
      title: '巡检日报_2026-02-25',
      description: '昨日巡检总结',
      type: 'inspection',
      category: 'daily',
      format: 'pdf',
      status: 'completed',
      createdAt: '2026-02-26T00:00:00Z',
      updatedAt: '2026-02-26T00:00:00Z',
      generatedBy: '系统',
      downloadUrl: '/api/v1/reports/files/report-1.pdf',
      parameters: {
        dateRange: { startDate: '2026-02-25', endDate: '2026-02-26' },
        includeCharts: true,
        includeDetailData: false,
        includeRecommendations: true,
      },
    }

    render(<ReportPreviewModal report={report} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTitle('报告预览')).toBeInTheDocument()
    })

    expect(screen.getByTitle('报告预览')).toHaveAttribute('src', 'blob:mock-preview')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/reports/files/report-1.pdf',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('存在 previewUrl 时应默认使用 HTML 预览，并可切换到 PDF', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(['<html><body>ok</body></html>'], { type: 'text/html' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
      })

    const report: Report = {
      id: '2',
      title: '巡检日报_2026-02-25',
      description: '昨日巡检总结',
      type: 'inspection',
      category: 'daily',
      format: 'pdf',
      status: 'completed',
      createdAt: '2026-02-26T00:00:00Z',
      updatedAt: '2026-02-26T00:00:00Z',
      generatedBy: '系统',
      downloadUrl: '/api/v1/reports/files/report-2.pdf',
      previewUrl: '/api/v1/reports/files/report-2.html',
      availableFormats: ['pdf', 'html'],
      parameters: {
        dateRange: { startDate: '2026-02-25', endDate: '2026-02-26' },
        includeCharts: true,
        includeDetailData: false,
        includeRecommendations: true,
      },
    }

    render(<ReportPreviewModal report={report} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTitle('报告预览')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/reports/files/report-2.html',
      expect.any(Object)
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'PDF 预览' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'PDF 预览' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/reports/files/report-2.pdf',
        expect.any(Object)
      )
    })
  })

  it('点击刷新 PDF 后应调用重渲染接口并加载新的 PDF 预览文件', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(['%PDF-old'], { type: 'application/pdf' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(['%PDF-new'], { type: 'application/pdf' }),
      })
    mockRerenderReportPdf.mockResolvedValue({
      format: 'pdf',
      downloadUrl: '/api/v1/reports/files/report-1-new.pdf',
      previewUrl: '/api/v1/reports/files/report-1-new.pdf',
    })

    const report: Report = {
      id: '1',
      title: '巡检日报_2026-02-25',
      description: '昨日巡检总结',
      type: 'inspection',
      category: 'daily',
      format: 'pdf',
      status: 'completed',
      createdAt: '2026-02-26T00:00:00Z',
      updatedAt: '2026-02-26T00:00:00Z',
      generatedBy: '系统',
      downloadUrl: '/api/v1/reports/files/report-1-old.pdf',
      availableFormats: ['pdf'],
      parameters: {
        dateRange: { startDate: '2026-02-25', endDate: '2026-02-26' },
        includeCharts: true,
        includeDetailData: false,
        includeRecommendations: true,
      },
    }

    render(<ReportPreviewModal report={report} onClose={() => {}} />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/reports/files/report-1-old.pdf',
        expect.any(Object)
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '刷新 PDF' }))

    await waitFor(() => {
      expect(mockRerenderReportPdf).toHaveBeenCalledWith('1')
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/v1/reports/files/report-1-new.pdf',
        expect.any(Object)
      )
    })
  })
})
