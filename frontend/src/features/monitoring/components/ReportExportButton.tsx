'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Sheet, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/atoms'
import { exportMonitoringReport } from '../api/monitoring.api'

type ExportFormat = 'pdf' | 'excel' | 'csv'

interface ExportStatus {
  isExporting: boolean
  lastExport?: {
    success: boolean
    format: ExportFormat
    message: string
  }
}

const FORMAT_CONFIG: Record<ExportFormat, { label: string; icon: typeof FileText; iconColor: string }> = {
  pdf: { label: 'PDF', icon: FileText, iconColor: 'text-red-500' },
  excel: { label: 'Excel', icon: Sheet, iconColor: 'text-green-600' },
  csv: { label: 'CSV', icon: FileSpreadsheet, iconColor: 'text-blue-500' },
}

export function ReportExportButton() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    isExporting: false,
  })
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const handleExport = async (format: ExportFormat) => {
    setIsMenuOpen(false)
    setExportStatus({ isExporting: true })

    try {
      const result = await exportMonitoringReport({
        format,
        time_range: '24h',
        sections: ['stats', 'charts', 'alerts'],
      })

      setExportStatus({
        isExporting: false,
        lastExport: {
          success: true,
          format,
          message: `${FORMAT_CONFIG[format].label} 报告已生成`,
        },
      })

      // 如果返回了下载URL,拼接后端地址后打开下载
      if (result.download_url) {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const downloadUrl = result.download_url.startsWith('http')
          ? result.download_url
          : `${apiBase}${result.download_url}`
        window.open(downloadUrl, '_blank')
      }

      // 3秒后清除成功消息
      setTimeout(() => {
        setExportStatus({ isExporting: false })
      }, 3000)
    } catch (error) {
      console.error('[ReportExportButton] Export failed:', error)

      setExportStatus({
        isExporting: false,
        lastExport: {
          success: false,
          format,
          message: error instanceof Error ? error.message : '导出失败,请稍后重试',
        },
      })

      // 5秒后清除错误消息
      setTimeout(() => {
        setExportStatus({ isExporting: false })
      }, 5000)
    }
  }

  const buttonLabel = exportStatus.isExporting
    ? '导出中...'
    : exportStatus.lastExport
      ? exportStatus.lastExport.message
      : '导出报告'

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        disabled={exportStatus.isExporting}
      >
        <Download className={`w-4 h-4 mr-2 ${exportStatus.isExporting ? 'animate-pulse' : ''}`} />
        {buttonLabel}
      </Button>

      {/* 下拉菜单 */}
      {isMenuOpen && !exportStatus.isExporting && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-card shadow-lg">
          <div className="p-1">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                选择格式
              </p>
            </div>
            {(['pdf', 'excel', 'csv'] as ExportFormat[]).map((format) => {
              const config = FORMAT_CONFIG[format]
              const Icon = config.icon
              return (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/60 dark:text-foreground/90 dark:hover:bg-muted/60"
                >
                  <Icon className={`h-4 w-4 ${config.iconColor}`} />
                  <span className="font-medium">{config.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
