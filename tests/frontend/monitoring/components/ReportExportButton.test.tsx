import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReportExportButton } from '@/features/monitoring/components/ReportExportButton'
import {
  exportMonitoringReport,
  checkMonitoringReportDownloadToken,
} from '@/features/monitoring/api/monitoring.api'
import { TokenManager } from '@/lib/api-client'

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

jest.mock('@/features/monitoring/api/monitoring.api', () => ({
  exportMonitoringReport: jest.fn(),
  checkMonitoringReportDownloadToken: jest.fn(),
}))

describe('ReportExportButton', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test'

    Object.defineProperty(URL, 'createObjectURL', {
      value: jest.fn(() => 'blob:mock'),
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: jest.fn(),
      writable: true,
    })
  })

  it('后端返回 download_token 时应优先使用 form POST 触发下载（不走 blob）', async () => {
    ;(exportMonitoringReport as jest.Mock).mockResolvedValue({
      format: 'pdf',
      time_range: '24h',
      sections: ['stats', 'charts', 'alerts'],
      generated_at: '2026-03-14T00:00:00.000Z',
      download_url: '/api/v1/monitoring/reports/download/test.pdf',
      download_form_url: '/api/v1/monitoring/reports/download',
      download_token: 'ticket-123',
      status: 'completed',
    })

    ;(checkMonitoringReportDownloadToken as jest.Mock).mockResolvedValue({
      valid: true,
    })

    const submitSpy = jest
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {})

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response(new Blob(['ok'], { type: 'application/pdf' }), {
        status: 200,
      }) as any
    )

    const accessSpy = jest
      .spyOn(TokenManager, 'getAccessToken')
      .mockReturnValue('token123')

    render(<ReportExportButton />)

    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('PDF'))

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalled()
    })

    expect(checkMonitoringReportDownloadToken).toHaveBeenCalledWith('ticket-123')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(accessSpy).not.toHaveBeenCalled()

    const form = document.querySelector('form') as HTMLFormElement | null
    expect(form).toBeTruthy()
    expect(form!.action).toBe('http://api.test/api/v1/monitoring/reports/download')

    const tokenInput = form!.querySelector('input[name="token"]') as HTMLInputElement | null
    expect(tokenInput).toBeTruthy()
    expect(tokenInput!.value).toBe('ticket-123')
  })

  it('React StrictMode 下 token 下载完成后应恢复按钮状态', async () => {
    ;(exportMonitoringReport as jest.Mock).mockResolvedValue({
      format: 'pdf',
      time_range: '24h',
      sections: ['stats', 'charts', 'alerts'],
      generated_at: '2026-03-14T00:00:00.000Z',
      download_url: '/api/v1/monitoring/reports/download/test.pdf',
      download_form_url: '/api/v1/monitoring/reports/download',
      download_token: 'ticket-123',
      status: 'completed',
    })

    ;(checkMonitoringReportDownloadToken as jest.Mock).mockResolvedValue({
      valid: true,
    })

    jest.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})

    render(
      <React.StrictMode>
        <ReportExportButton />
      </React.StrictMode>
    )

    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('PDF'))

    await waitFor(() => {
      expect(screen.getByText('PDF 报告已发起下载')).toBeTruthy()
    })
    expect(screen.getByText('PDF 报告已发起下载')).not.toBeDisabled()
  })

  it('download_token 预检失败时应提示错误且不发起下载', async () => {
    ;(exportMonitoringReport as jest.Mock).mockResolvedValue({
      format: 'pdf',
      time_range: '24h',
      sections: ['stats', 'charts', 'alerts'],
      generated_at: '2026-03-14T00:00:00.000Z',
      download_url: '/api/v1/monitoring/reports/download/test.pdf',
      download_form_url: '/api/v1/monitoring/reports/download',
      download_token: 'ticket-123',
      status: 'completed',
    })

    ;(checkMonitoringReportDownloadToken as jest.Mock).mockResolvedValue({
      valid: false,
      message: '下载票据已过期',
    })

    const submitSpy = jest
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {})
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response(new Blob(['ok'], { type: 'application/pdf' }), {
        status: 200,
      }) as any
    )

    render(<ReportExportButton />)

    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('PDF'))

    await waitFor(() => {
      expect(screen.getByText('下载票据已过期')).toBeTruthy()
    })

    expect(submitSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('应携带 Authorization 头下载报告', async () => {
    ;(exportMonitoringReport as jest.Mock).mockResolvedValue({
      format: 'pdf',
      time_range: '24h',
      sections: ['stats', 'charts', 'alerts'],
      generated_at: '2026-03-14T00:00:00.000Z',
      download_url: '/api/v1/monitoring/reports/download/test.pdf',
      status: 'completed',
    })

    jest.spyOn(TokenManager, 'getAccessToken').mockReturnValue('token123')

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response(new Blob(['ok'], { type: 'application/pdf' }), {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="test.pdf"',
        },
      }) as any
    )

    const anchorClickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(<ReportExportButton />)

    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('PDF'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    })

    expect(exportMonitoringReport).toHaveBeenCalledWith({
      format: 'pdf',
      time_range: '24h',
      sections: ['stats', 'charts', 'alerts'],
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.test/api/v1/monitoring/reports/download/test.pdf',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token123',
        }),
      })
    )

    expect(anchorClickSpy).toHaveBeenCalled()
  })

  it('应透传 timeRange 与 sections 到导出接口', async () => {
    ;(exportMonitoringReport as jest.Mock).mockResolvedValue({
      format: 'pdf',
      time_range: '7d',
      sections: ['stats'],
      generated_at: '2026-03-14T00:00:00.000Z',
      download_url: '/api/v1/monitoring/reports/download/test.pdf',
      status: 'completed',
    })

    jest.spyOn(TokenManager, 'getAccessToken').mockReturnValue('token123')
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response(new Blob(['ok'], { type: 'application/pdf' }), {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="test.pdf"',
        },
      }) as any
    )

    render(<ReportExportButton timeRange="7d" sections={['stats']} />)

    fireEvent.click(screen.getByText('导出报告'))
    fireEvent.click(screen.getByText('PDF'))

    await waitFor(() => {
      expect(exportMonitoringReport).toHaveBeenCalled()
    })

    expect(exportMonitoringReport).toHaveBeenCalledWith({
      format: 'pdf',
      time_range: '7d',
      sections: ['stats'],
    })
  })
})
