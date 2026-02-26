// @ts-nocheck
import React from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Settings,
  AlertCircle,
  BarChart3,
  Table as TableIcon,
  Filter
} from 'lucide-react'
import { Badge, Button, Loading } from '@/components/atoms'
import { usePreviewCustomReportConfig } from '../hooks/useReports'

interface Props {
  configId: number
  parameters?: Record<string, any>
  onClose: () => void
  onGenerate?: () => void
}

const formatDateRange = (parameters: any): string => {
  const range = parameters?.dateRange
  const start = range?.startDate ? String(range.startDate).slice(0, 10) : ''
  const end = range?.endDate ? String(range.endDate).slice(0, 10) : ''
  if (!start && !end) return '-'
  if (start && end) return `${start} ~ ${end}`
  return start || end
}

export const ConfigPreviewModal: React.FC<Props> = ({
  configId,
  parameters = {},
  onClose,
  onGenerate
}) => {
  const { data, isLoading, error, refetch } = usePreviewCustomReportConfig(configId, {
    parameters,
    limit: 100,
  })

  const previewData: any = data || null
  const charts = Array.isArray(previewData?.charts) ? previewData.charts : []
  const tables = Array.isArray(previewData?.tables) ? previewData.tables : []
  const filters = Array.isArray(previewData?.filters) ? previewData.filters : []
  const layout = previewData?.layout || {}

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
            <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">配置预览</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {previewData?.name || `配置 #${configId}`}
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
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loading />
              <span className="ml-2 text-gray-600 dark:text-gray-400">加载配置中...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="w-10 h-10 text-red-500 dark:text-red-400 mx-auto mb-3" />
                <div className="text-red-600 dark:text-red-400 mb-2">加载预览失败</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {error.message || '未知错误'}
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                  重试
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && previewData && (
            <div className="space-y-6">
              {/* 提示信息 */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 rounded-lg p-4">
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  当前为配置结构预览（不包含真实数据行）。如需查看最终内容，请点击“生成完整报表”并下载文件。
                </div>
              </div>

              {/* 基本信息 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-base font-medium text-blue-900 dark:text-blue-200">
                      {previewData.name || `配置 #${configId}`}
                    </div>
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      {previewData.description || '无描述'}
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      参数范围：{formatDateRange(previewData.parameters || parameters)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {previewData.isDefault !== undefined && (
                      <Badge variant={previewData.isDefault ? 'primary' : 'secondary'}>
                        {previewData.isDefault ? '默认模板' : '自定义'}
                      </Badge>
                    )}
                    {previewData.isActive !== undefined && (
                      <Badge variant={previewData.isActive ? 'success' : 'warning'}>
                        {previewData.isActive ? '启用中' : '已停用'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 配置概览 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">图表</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{charts.length}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">表格</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{tables.length}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">过滤器</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{filters.length}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">布局列数</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {layout?.columns || 0}
                  </div>
                </div>
              </div>

              {/* 图表配置 */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  图表配置 ({charts.length})
                </h3>
                {charts.length > 0 ? (
                  <div className="space-y-3">
                    {charts.map((chart: any, index: number) => (
                      <div
                        key={chart.id || index}
                        className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {chart.title || `图表 ${index + 1}`}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          类型：{chart.type || '-'}，数据源：{chart.dataSource || chart.data_source || '-'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          X 轴：{chart.xAxis || chart.x_axis || '-'}，Y 轴：{chart.yAxis || chart.y_axis || '-'}，
                          系列：{Array.isArray(chart.series) ? chart.series.length : 0}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                    暂无图表配置
                  </div>
                )}
              </div>

              {/* 表格配置 */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <TableIcon className="w-5 h-5" />
                  表格配置 ({tables.length})
                </h3>
                {tables.length > 0 ? (
                  <div className="space-y-3">
                    {tables.map((table: any, index: number) => (
                      <div
                        key={table.id || index}
                        className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {table.title || `表格 ${index + 1}`}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          数据源：{table.dataSource || table.data_source || '-'}，列数：
                          {Array.isArray(table.columns) ? table.columns.length : 0}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                    暂无表格配置
                  </div>
                )}
              </div>

              {/* 过滤器 */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  过滤器 ({filters.length})
                </h3>
                {filters.length > 0 ? (
                  <div className="space-y-3">
                    {filters.map((filter: any, index: number) => (
                      <div
                        key={filter.id || index}
                        className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {filter.label || `过滤器 ${index + 1}`}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          字段：{filter.field || '-'}，类型：{filter.type || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                    暂无过滤器配置
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

