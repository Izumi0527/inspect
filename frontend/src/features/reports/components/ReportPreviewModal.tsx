import React from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Download, Eye } from 'lucide-react'
import { Button } from '@/components/atoms'
import { Report } from '../types'

interface Props {
  report: Report
  onClose: () => void
}

export const ReportPreviewModal: React.FC<Props> = ({ report, onClose }) => {
  const handleDownload = () => {
    if (report.downloadUrl) {
      const a = document.createElement('a')
      a.href = report.downloadUrl
      a.download = `${report.title}.${report.format}`
      a.click()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{report.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{report.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              下载
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 内容预览 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
            <Eye className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">报告预览</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              报告预览功能正在开发中，您可以点击下载按钮获取完整报告。
            </p>
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>报告格式：{report.format.toUpperCase()}</p>
              <p>生成时间：{new Date(report.createdAt).toLocaleString()}</p>
              <p>生成者：{report.generatedBy}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}