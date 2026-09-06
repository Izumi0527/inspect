import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import toast from 'react-hot-toast'
import { authorizedDownload } from '@/lib/api-client'
import { generateInspectionReport } from '@/features/inspection/api/inspection.api'
import { useGenerateReport } from '@/features/inspection/hooks/useInspection'

jest.mock('@/features/inspection/api/inspection.api', () => ({
  generateInspectionReport: jest.fn(),
}))

jest.mock('@/lib/api-client', () => ({
  api: {},
  authorizedDownload: jest.fn(),
  getApiOrigin: () => 'http://localhost:18080',
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}))

const request = { executionId: 'batch-report-test', type: 'detailed' as const, format: 'pdf' as const }
const fallback = '巡检报告生成失败，请稍后重试或联系管理员'

const renderReportHook = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { ...renderHook(() => useGenerateReport(), { wrapper }), client }
}

describe('巡检报告生成与错误提示', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    ['生成失败', 'failed to generate report', fallback],
    ['统计导出失败', 'failed to export analytics', '统计报表导出失败，请稍后重试或联系管理员'],
    ['创建失败', 'failed to create report', '巡检报告创建失败，请稍后重试或联系管理员'],
    ['服务未配置', 'report service not configured', '报告服务未配置，请联系管理员'],
    ['输出未配置', 'report output not configured', '报告输出目录未配置，请联系管理员'],
    ['未知英文', 'Network error', fallback],
    ['中文错误', '下载文件失败', '下载文件失败'],
    ['带空白的中文错误', '  下载文件失败 \n', '下载文件失败'],
    ['空消息', '', fallback],
    ['纯换行', '\n', fallback],
    ['纯空白', ' \t\r\n ', fallback],
  ])('%s 应显示明确的中文提示', async (_name, message, expected) => {
    ;(generateInspectionReport as jest.Mock).mockRejectedValueOnce(new Error(message))
    const { result, client } = renderReportHook()
    try {
      await act(async () => {
        await expect(result.current.mutateAsync(request)).rejects.toThrow(message)
      })
      expect(toast.error).toHaveBeenCalledWith(expected)
      expect(toast.success).not.toHaveBeenCalled()
      expect(authorizedDownload).not.toHaveBeenCalled()
    } finally {
      client.clear()
    }
  })

  it('生成 PDF 后应携带认证下载文件并清理临时链接', async () => {
    const blob = new Blob(['%PDF-1.4\n'], { type: 'application/pdf' })
    ;(generateInspectionReport as jest.Mock).mockResolvedValueOnce({
      report_id: 'report-test',
      download_url: '/api/v1/reports/files/report-test.pdf',
    })
    ;(authorizedDownload as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="report-test.pdf"' }),
    })
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = jest.fn(() => 'blob:report-test')
    URL.revokeObjectURL = jest.fn()
    let downloadedFilename = ''
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download
    })
    const { result, client } = renderReportHook()
    try {
      await act(async () => {
        await result.current.mutateAsync(request)
      })
      expect(generateInspectionReport).toHaveBeenCalledWith({
        execution_id: request.executionId,
        format: 'pdf',
        template: 'detailed',
      })
      expect(authorizedDownload).toHaveBeenCalledWith('http://localhost:18080/api/v1/reports/files/report-test.pdf')
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report-test')
      expect(downloadedFilename).toBe('report-test.pdf')
      expect(document.querySelector('a[download="report-test.pdf"]')).toBeNull()
      expect(toast.success).toHaveBeenCalledWith('报告已生成，正在下载...')
      expect(toast.error).not.toHaveBeenCalled()
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      client.clear()
    }
  })
})
