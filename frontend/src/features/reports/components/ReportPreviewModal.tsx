import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { FileText, Download, Eye, AlertCircle, RefreshCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Modal, ModalContent, ModalTitle } from '@/components/atoms'
import { downloadWithAuth } from '@/utils/download'
import { authorizedDownload, getApiOrigin } from '@/lib/api-client'
import { Report } from '../types'
import { downloadReport as fetchDownloadUrl, rerenderReportPdf } from '../api/reports.api'

const resolveUrl = (urlOrPath: string): string => {
  const raw = String(urlOrPath || '').trim()
  if (/^https?:\/\//i.test(raw)) return raw

  const apiOrigin = getApiOrigin()
  if (!raw.startsWith('/')) return `${apiOrigin}/${raw}`
  return `${apiOrigin}${raw}`
}

interface Props {
  report: Report
  onClose: () => void
}

export const ReportPreviewModal: React.FC<Props> = ({ report, onClose }) => {
  type PreviewMode = 'html' | 'pdf'

  const htmlPreviewAvailable = useMemo(() => {
    if (report.status !== 'completed') return false
    return Boolean(report.previewUrl) || (report.availableFormats ?? []).includes('html')
  }, [report.availableFormats, report.previewUrl, report.status])

  const pdfPreviewAvailable = useMemo(() => {
    if (report.status !== 'completed') return false
    return report.format === 'pdf' || (report.availableFormats ?? []).includes('pdf')
  }, [report.availableFormats, report.format, report.status])

  const [downloadUrl, setDownloadUrl] = useState<string | null>(report.downloadUrl ?? null)
  const [mode, setMode] = useState<PreviewMode>(() => (htmlPreviewAvailable ? 'html' : 'pdf'))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [rerenderingPdf, setRerenderingPdf] = useState(false)
  const [freshPdfUrl, setFreshPdfUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const cleanupObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      window.URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const ensureDownloadUrl = useCallback(async (): Promise<string> => {
    if (downloadUrl) return downloadUrl
    const url = await fetchDownloadUrl(report.id)
    setDownloadUrl(url)
    return url
  }, [downloadUrl, report.id])

  const ensureHtmlPreviewUrl = useCallback(async (): Promise<string> => {
    if (report.previewUrl) return report.previewUrl
    if ((report.availableFormats ?? []).includes('html')) {
      return fetchDownloadUrl(report.id, 'html')
    }
    throw new Error('该报表暂无 HTML 预览')
  }, [report.availableFormats, report.id, report.previewUrl])

  const ensurePdfPreviewUrl = useCallback(async (): Promise<string> => {
    if (freshPdfUrl) return freshPdfUrl
    if (report.format === 'pdf') {
      // 主格式即 PDF：优先用后端返回的 downloadUrl，缺失时再请求一次 download 接口兜底
      if (report.downloadUrl) return report.downloadUrl
      return ensureDownloadUrl()
    }
    if ((report.availableFormats ?? []).includes('pdf')) {
      return fetchDownloadUrl(report.id, 'pdf')
    }
    throw new Error('该报表暂无 PDF 预览')
  }, [ensureDownloadUrl, freshPdfUrl, report.availableFormats, report.downloadUrl, report.format, report.id])

  const loadPreview = useCallback(async () => {
    cleanupObjectUrl()
    setPreviewUrl(null)
    setPreviewError(null)

    if (report.status !== 'completed') {
      return
    }

    try {
      setLoadingPreview(true)
      let urlOrPath = ''
      if (mode === 'html') {
        if (!htmlPreviewAvailable) {
          throw new Error('该报表暂无 HTML 预览')
        }
        urlOrPath = await ensureHtmlPreviewUrl()
      } else {
        if (!pdfPreviewAvailable) {
          throw new Error('该报表暂无 PDF 预览')
        }
        urlOrPath = await ensurePdfPreviewUrl()
      }

      const resolved = resolveUrl(urlOrPath)
      const response = await authorizedDownload(resolved)
      if (!response.ok) {
        throw new Error(`预览加载失败(${response.status})`)
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      objectUrlRef.current = objectUrl
      setPreviewUrl(objectUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : '预览加载失败'
      setPreviewError(message)
      toast.error(message || '预览加载失败，请稍后重试')
    } finally {
      setLoadingPreview(false)
    }
  }, [
    cleanupObjectUrl,
    ensureHtmlPreviewUrl,
    ensurePdfPreviewUrl,
    htmlPreviewAvailable,
    mode,
    pdfPreviewAvailable,
    report.status,
  ])

  useEffect(() => {
    setDownloadUrl(report.downloadUrl ?? null)
    setFreshPdfUrl(null)
    // 报表切换时：优先用 HTML 作为在线预览（观感更佳），否则退化到 PDF
    if (htmlPreviewAvailable) {
      setMode('html')
    } else if (pdfPreviewAvailable) {
      setMode('pdf')
    }
  }, [htmlPreviewAvailable, pdfPreviewAvailable, report.downloadUrl, report.id])

  useEffect(() => {
    void loadPreview()
    return () => cleanupObjectUrl()
  }, [cleanupObjectUrl, loadPreview, mode])

  const handleDownload = async () => {
    try {
      const urlOrPath = await ensureDownloadUrl()
      if (!urlOrPath) {
        toast.error('暂无可用的下载链接')
        return
      }

      const format = String(report.format || 'pdf').toLowerCase()
      const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
      const filename = `${report.title || 'report'}.${ext}`
      await downloadWithAuth(urlOrPath, filename)
    } catch (err) {
      console.error('下载报表失败:', err)
      toast.error('下载失败，请稍后重试')
    }
  }

  const handleRerenderPdf = async () => {
    if (!pdfPreviewAvailable || rerenderingPdf) return

    try {
      setRerenderingPdf(true)
      setPreviewError(null)
      const result = await rerenderReportPdf(report.id)
      const nextPdfUrl = result.previewUrl || result.downloadUrl
      setFreshPdfUrl(nextPdfUrl)
      if (report.format === 'pdf') {
        setDownloadUrl(result.downloadUrl)
      }
      setMode('pdf')
      toast.success('PDF 已按最新模板重新生成')
    } catch (err) {
      console.error('重新生成 PDF 失败:', err)
      const message = err instanceof Error ? err.message : '重新生成 PDF 失败'
      setPreviewError(message)
      toast.error(message)
    } finally {
      setRerenderingPdf(false)
    }
  }

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent className="sm:max-w-4xl p-0" hideDescription>
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 pr-14 border-b dark:border-border">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <ModalTitle className="text-xl font-semibold text-foreground">{report.title || '报表预览'}</ModalTitle>
              <p className="text-sm text-muted-foreground">{report.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report.status === 'completed' && (htmlPreviewAvailable || pdfPreviewAvailable) && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {htmlPreviewAvailable && (
                  <Button
                    size="sm"
                    variant={mode === 'html' ? 'secondary' : 'ghost'}
                    onClick={() => setMode('html')}
                    title="HTML 预览（更适合在线阅读）"
                  >
                    HTML 预览
                  </Button>
                )}
                {pdfPreviewAvailable && (
                  <Button
                    size="sm"
                    variant={mode === 'pdf' ? 'secondary' : 'ghost'}
                    onClick={() => setMode('pdf')}
                    title="PDF 预览（与下载版一致）"
                  >
                    PDF 预览
                  </Button>
                )}
              </div>
            )}
            {report.status === 'completed' && pdfPreviewAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRerenderPdf()}
                disabled={rerenderingPdf || loadingPreview}
                title="按最新 PDF 模板重新生成"
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${rerenderingPdf ? 'animate-spin' : ''}`} />
                {rerenderingPdf ? '生成中' : '刷新 PDF'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              下载
            </Button>
          </div>
        </div>

        {/* 内容预览 */}
        <div className="p-6">
          {report.status !== 'completed' ? (
            <div className="bg-muted/40 rounded-lg p-8 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">报告尚未生成完成</h3>
              <p className="text-muted-foreground mb-4">
                当前状态：{report.status === 'generating' ? '生成中' : report.status === 'failed' ? '生成失败' : '已计划'}
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>报告格式：{report.format.toUpperCase()}</p>
                <p>创建时间：{formatDateTimeYMDHMS(report.createdAt)}</p>
                <p>生成者：{report.generatedBy}</p>
              </div>
            </div>
          ) : !htmlPreviewAvailable && !pdfPreviewAvailable ? (
            <div className="bg-muted/40 rounded-lg p-8 text-center">
              <Eye className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">暂不支持在线预览</h3>
              <p className="text-muted-foreground mb-4">
                当前报表未提供可用的 HTML/PDF 预览，请使用下载功能查看完整内容。
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>生成时间：{formatDateTimeYMDHMS(report.createdAt)}</p>
                <p>生成者：{report.generatedBy}</p>
              </div>
            </div>
          ) : loadingPreview ? (
            <div className="bg-muted/40 rounded-lg p-8 text-center">
              <Eye className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4 animate-pulse" />
              <h3 className="text-lg font-medium text-foreground mb-2">加载预览中...</h3>
              <p className="text-muted-foreground">正在获取并渲染报表文件</p>
              {mode === 'html' && (
                <p className="text-xs text-muted-foreground mt-3">
                  HTML 预览用于提升可读性，排版可能与下载版 PDF 略有差异；以下载版为准。
                </p>
              )}
            </div>
          ) : previewError ? (
            <div className="bg-muted/40 rounded-lg p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">预览加载失败</h3>
              <p className="text-muted-foreground mb-4">{previewError}</p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" onClick={() => void loadPreview()}>
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  重试
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  下载查看
                </Button>
              </div>
            </div>
          ) : previewUrl ? (
            <div className="rounded-lg overflow-hidden border border-border bg-card">
              <iframe
                title="报告预览"
                data-testid="report-preview-frame"
                src={previewUrl}
                className="w-full h-[70vh]"
                // HTML 预览需更严格的 sandbox；PDF 交给浏览器内置 viewer。
                sandbox={mode === 'html' ? '' : undefined}
              />
            </div>
          ) : (
            <div className="bg-muted/40 rounded-lg p-8 text-center">
              <Eye className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">暂无预览内容</h3>
              <p className="text-muted-foreground">请稍后重试或直接下载查看。</p>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  )
}
