'use client'

import { useState, useRef, useEffect } from 'react'
import { Download } from 'lucide-react'
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
          message: `${formatLabel(format)} 报告已生成`,
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

  const formatLabel = (format: ExportFormat): string => {
    const labels = { pdf: 'PDF', excel: 'Excel', csv: 'CSV' }
    return labels[format]
  }

  const formatIcon = (format: ExportFormat): string => {
    const icons = { pdf: '📄', excel: '📊', csv: '📑' }
    return icons[format]
  }

  const buttonLabel = exportStatus.isExporting
    ? '导出中...'
    : exportStatus.lastExport
      ? exportStatus.lastExport.success
        ? exportStatus.lastExport.message
        : exportStatus.lastExport.message
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
        <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="p-1">
            <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                选择格式
              </p>
            </div>
            {(['pdf', 'excel', 'csv'] as ExportFormat[]).map((format) => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <span className="text-lg">{formatIcon(format)}</span>
                <span className="font-medium">{formatLabel(format)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
