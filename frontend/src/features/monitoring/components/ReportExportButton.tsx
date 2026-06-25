'use client'

import { useState, useRef, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/atoms'
import { authorizedDownload, getApiOrigin } from '@/lib/api-client'
import { exportMonitoringReport, checkMonitoringReportDownloadToken } from '../api/monitoring.api'

type ExportFormat = 'pdf'

interface ExportStatus {
  isExporting: boolean
  lastExport?: {
    success: boolean
    format: ExportFormat
    message: string
  }
}

const PDF_FORMAT_LABEL = 'PDF'

function resolveApiBaseUrl(): string {
  return getApiOrigin()
}

function resolveAbsoluteUrl(rawUrl: string): string {
  const trimmed = String(rawUrl ?? '').trim()
  if (trimmed === '') return ''

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  const apiBase = resolveApiBaseUrl()
  if (apiBase.endsWith('/') && trimmed.startsWith('/')) {
    return `${apiBase.slice(0, -1)}${trimmed}`
  }
  if (!apiBase.endsWith('/') && !trimmed.startsWith('/')) {
    return `${apiBase}/${trimmed}`
  }
  return `${apiBase}${trimmed}`
}

function extractFilenameFromUrl(rawUrl: string): string | null {
  const url = String(rawUrl ?? '').trim()
  if (!url) return null
  const withoutQuery = url.split('?')[0]
  const parts = withoutQuery.split('/').filter(Boolean)
  const last = parts.length > 0 ? parts[parts.length - 1] : ''
  return last ? last : null
}

function parseFilenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null

  // RFC 5987: filename*=utf-8''encoded
  const filenameStar = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(value)
  if (filenameStar?.[2]) {
    try {
      return decodeURIComponent(filenameStar[2])
    } catch {
      return filenameStar[2]
    }
  }

  const filename = /filename\s*=\s*\"?([^\";]+)\"?/i.exec(value)
  if (filename?.[1]) {
    return filename[1]
  }

  return null
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'

  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // 延迟释放 URL，避免极端情况下下载尚未开始就被回收
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

function triggerTokenFormDownload(downloadUrl: string, token: string) {
  const absoluteUrl = resolveAbsoluteUrl(downloadUrl)
  if (!absoluteUrl) {
    throw new Error('下载链接为空')
  }
  const ticket = String(token ?? '').trim()
  if (!ticket) {
    throw new Error('下载票据为空')
  }

  const frameName = `download_frame_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const iframe = document.createElement('iframe')
  iframe.name = frameName
  iframe.style.display = 'none'

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = absoluteUrl
  form.target = frameName
  form.style.display = 'none'

  // 与后端字段名兼容：同时发送 token 与 download_token
  for (const name of ['token', 'download_token']) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = ticket
    form.appendChild(input)
  }

  document.body.appendChild(iframe)
  document.body.appendChild(form)

  form.submit()

  // 延迟清理：避免极端情况下请求尚未发出就被移除
  window.setTimeout(() => {
    form.remove()
    iframe.remove()
  }, 30_000)
}

async function downloadWithCookieAuth(downloadUrl: string): Promise<void> {
  const absoluteUrl = resolveAbsoluteUrl(downloadUrl)
  if (!absoluteUrl) {
    throw new Error('下载链接为空')
  }

  // Cookie 认证：httpOnly access_token 随请求自动携带，fallback 下载不再依赖 localStorage token
  const response = await authorizedDownload(absoluteUrl)

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('下载失败：未登录或登录已过期')
    }
    if (response.status === 403) {
      throw new Error('下载失败：无权限下载该报告')
    }
    if (response.status === 404) {
      throw new Error('下载失败：报告文件不存在或已过期')
    }
    throw new Error(`下载失败：HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const filename =
    parseFilenameFromContentDisposition(response.headers.get('content-disposition')) ||
    extractFilenameFromUrl(absoluteUrl) ||
    'monitoring-report'

  triggerBrowserDownload(blob, filename)
}

export interface ReportExportButtonProps {
  /** 时间范围（例如 24h/7d/30d），会透传到后端导出接口 */
  timeRange?: string
  /** 导出内容分区（stats/charts/alerts），会透传到后端导出接口 */
  sections?: string[]
}

export function ReportExportButton({
  timeRange = '24h',
  sections = ['stats', 'charts', 'alerts'],
}: ReportExportButtonProps) {
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    isExporting: false,
  })
  const clearMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (clearMessageTimerRef.current) {
        clearTimeout(clearMessageTimerRef.current)
      }
    }
  }, [])

  const scheduleClearMessage = (delayMs: number) => {
    if (clearMessageTimerRef.current) {
      clearTimeout(clearMessageTimerRef.current)
    }
    clearMessageTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return
      setExportStatus({ isExporting: false })
    }, delayMs)
  }

  const handleExport = async () => {
    const format: ExportFormat = 'pdf'
    setExportStatus({ isExporting: true })

    try {
      const result = await exportMonitoringReport({
        format,
        time_range: timeRange,
        sections,
      })

      const downloadToken =
        typeof result.download_token === 'string' ? result.download_token.trim() : ''
      const downloadFormUrl =
        typeof result.download_form_url === 'string' ? result.download_form_url.trim() : ''

      if (downloadToken !== '' && downloadFormUrl !== '') {
        // 预检：token 下载无法在前端可靠拿到 HTTP 状态，提前用鉴权接口校验可提升错误提示体验。
        // 若预检接口不可用（网络/服务异常），仍继续尝试下载，避免误阻断。
        let precheck: Awaited<ReturnType<typeof checkMonitoringReportDownloadToken>> | null = null
        try {
          precheck = await checkMonitoringReportDownloadToken(downloadToken)
        } catch (error) {
          console.warn('[ReportExportButton] download token precheck failed, continue download:', error)
        }
        if (precheck && !precheck.valid) {
          throw new Error(precheck.message || '下载票据已过期或已使用，请重新导出')
        }
        triggerTokenFormDownload(downloadFormUrl, downloadToken)
      } else if (result.download_url) {
        await downloadWithCookieAuth(result.download_url)
      }

      if (!isMountedRef.current) return
      setExportStatus({
        isExporting: false,
        lastExport: {
          success: true,
          format,
          message: `${PDF_FORMAT_LABEL} 报告已发起下载`,
        },
      })

      // 3秒后清除成功消息
      scheduleClearMessage(3000)
    } catch (error) {
      console.error('[ReportExportButton] Export failed:', error)

      if (!isMountedRef.current) return
      setExportStatus({
        isExporting: false,
        lastExport: {
          success: false,
          format,
          message: error instanceof Error ? error.message : '导出失败,请稍后重试',
        },
      })

      // 5秒后清除错误消息
      scheduleClearMessage(5000)
    }
  }

  const buttonLabel = exportStatus.isExporting
    ? '导出中...'
    : exportStatus.lastExport
      ? exportStatus.lastExport.message
      : '导出报告'

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => void handleExport()}
        disabled={exportStatus.isExporting}
      >
        <Download className={`w-4 h-4 mr-2 ${exportStatus.isExporting ? 'animate-pulse' : ''}`} />
        {buttonLabel}
      </Button>
    </div>
  )
}
