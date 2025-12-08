'use client'

import { useState, useRef, useEffect } from 'react'
import { exportMonitoringReport } from '../api/monitoring.api'

/**
 * 报告导出按钮组件
 *
 * @features
 * - 下拉菜单选择导出格式(PDF, Excel, CSV)
 * - 调用后端API导出监控报告
 * - 显示导出状态(进行中/成功/失败)
 * - 自动关闭菜单
 */

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

      // 如果返回了下载URL,自动打开下载
      if (result.download_url) {
        window.open(result.download_url, '_blank')
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
    const labels = {
      pdf: 'PDF',
      excel: 'Excel',
      csv: 'CSV',
    }
    return labels[format]
  }

  const formatIcon = (format: ExportFormat): string => {
    const icons = {
      pdf: '📄',
      excel: '📊',
      csv: '📑',
    }
    return icons[format]
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* 导出按钮 */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        disabled={exportStatus.isExporting}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          exportStatus.isExporting
            ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            : exportStatus.lastExport?.success
            ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800'
            : exportStatus.lastExport && !exportStatus.lastExport.success
            ? 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800'
            : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
        }`}
        title="导出监控报告"
      >
        {exportStatus.isExporting ? (
          <>⏳ 导出中...</>
        ) : exportStatus.lastExport ? (
          exportStatus.lastExport.success ? (
            <>✅ {exportStatus.lastExport.message}</>
          ) : (
            <>❌ {exportStatus.lastExport.message}</>
          )
        ) : (
          <>📥 导出报告</>
        )}
      </button>

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
