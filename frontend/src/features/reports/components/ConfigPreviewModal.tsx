// @ts-nocheck
import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Eye, AlertCircle, BarChart3, Table as TableIcon } from 'lucide-react'
import { Button, Loading } from '@/components/atoms'
import { usePreviewCustomReportConfig } from '../hooks/useReports'

interface Props {
  configId: number
  parameters?: Record<string, any>
  onClose: () => void
  onGenerate?: () => void
}

export const ConfigPreviewModal: React.FC<Props> = ({
  configId,
  parameters = {},
  onClose,
  onGenerate
}) => {
  // 调用预览 API
  const { data: previewData, isLoading, error, refetch } = usePreviewCustomReportConfig(
    configId,
    {
      parameters,
      limit: 100
    }
  )

  // 当参数变化时重新获取预览
  useEffect(() => {
    refetch()
  }, [parameters, refetch])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">报表预览</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {previewData?.title || '加载中...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onGenerate && (
              <Button onClick={onGenerate}>
                生成完整报表
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 加载状态 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loading />
              <span className="ml-2 text-gray-600 dark:text-gray-400">加载预览数据中...</span>
            </div>
          )}

          {/* 错误状态 */}
          {error && (
            <div className="flex items-center justify-center py-12">
              <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400 mr-2" />
              <span className="text-red-600 dark:text-red-400">加载预览失败: {error.message}</span>
            </div>
          )}

          {/* 预览内容 */}
          {!isLoading && !error && previewData && (
            <div className="space-y-6">
              {/* 报表信息 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">报表信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">标题：</span>
                    <span className="text-blue-900 dark:text-blue-200">{previewData.title}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">描述：</span>
                    <span className="text-blue-900 dark:text-blue-200">{previewData.description || '无'}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">数据源：</span>
                    <span className="text-blue-900 dark:text-blue-200">{previewData.config?.dataSource || '未知'}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">预览限制：</span>
                    <span className="text-blue-900 dark:text-blue-200">{previewData.dataInfo?.previewLimit || 0} 条</span>
                  </div>
                </div>
              </div>

              {/* 提示信息 */}
              {previewData.dataInfo?.note && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    {previewData.dataInfo.note}
                  </p>
                </div>
              )}

              {/* 图表预览 */}
              {previewData.previewCharts && previewData.previewCharts.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    图表预览 ({previewData.previewCharts.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {previewData.previewCharts.map((chart: any, index: number) => (
                      <div
                        key={chart.id || index}
                        className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      >
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                          {chart.title || `图表 ${index + 1}`}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          类型：{chart.type || 'line'}
                        </p>
                        <div className="bg-white dark:bg-gray-900 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 h-40 flex items-center justify-center">
                          <div className="text-center text-gray-500 dark:text-gray-400">
                            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">
                              {chart.dataPreview && chart.dataPreview.length > 0
                                ? `${chart.dataPreview.length} 个数据点`
                                : '暂无数据'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 表格预览 */}
              {previewData.previewTables && previewData.previewTables.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <TableIcon className="w-5 h-5" />
                    表格预览 ({previewData.previewTables.length})
                  </h3>
                  <div className="space-y-4">
                    {previewData.previewTables.map((table: any, index: number) => (
                      <div
                        key={table.id || index}
                        className="border dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b dark:border-gray-700">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {table.title || `表格 ${index + 1}`}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {table.totalRows > 0
                              ? `总计 ${table.totalRows} 行，预览 ${table.rowsPreview?.length || 0} 行`
                              : '暂无数据'}
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                              <tr>
                                {table.columns && table.columns.length > 0 ? (
                                  table.columns.map((col: any, colIndex: number) => (
                                    <th
                                      key={colIndex}
                                      className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                      {col.label || col.key || `列 ${colIndex + 1}`}
                                    </th>
                                  ))
                                ) : (
                                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                                    暂无列定义
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rowsPreview && table.rowsPreview.length > 0 ? (
                                table.rowsPreview.map((row: any, rowIndex: number) => (
                                  <tr key={rowIndex} className="border-t dark:border-gray-700">
                                    {table.columns.map((col: any, colIndex: number) => (
                                      <td
                                        key={colIndex}
                                        className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                                      >
                                        {row[col.key] || '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td
                                    colSpan={table.columns?.length || 1}
                                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                                  >
                                    暂无数据
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 无内容提示 */}
              {(!previewData.previewCharts || previewData.previewCharts.length === 0) &&
                (!previewData.previewTables || previewData.previewTables.length === 0) && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
                    <Eye className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">暂无预览内容</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      该报表配置尚未包含图表或表格配置
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
