import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Upload, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
import { useCreateTemplate } from '../hooks/useInspection'
import { isCheckItemTypeSupported } from '../utils/check-item-support'
import {
  buildTemplateXlsx,
  parseTemplateXlsx,
  type ParseError,
  type ParsedTemplate,
} from '../utils/templateExcel'
import type { InspectionTemplate, TemplateCategory } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface ImportResult {
  name: string
  status: 'success' | 'failed'
  error?: string
  warning?: string
}

const XLSX_EXTENSIONS = /\.xlsx$/i
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const TemplateImportModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createTemplate = useCreateTemplate()

  const handleFileSelect = (file: File) => {
    if (!XLSX_EXTENSIONS.test(file.name) && file.type !== XLSX_MIME) {
      toast.error('请选择 .xlsx 格式的 Excel 文件')
      return
    }
    setPickedFile(file)
    setImportResults([])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  // 下载空白模板（含示例数据 + 字段下拉 + 使用说明 Sheet）
  const handleDownloadTemplate = async () => {
    try {
      const blob = await buildTemplateXlsx()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '巡检模板导入模板.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('模板已下载，请在 Excel/WPS 中编辑后上传')
    } catch (error) {
      toast.error('模板下载失败：' + (error instanceof Error ? error.message : '未知错误'))
    }
  }

  const formatErrors = (errors: ParseError[]): string =>
    errors.map(e => `[Sheet ${e.sheet} 行 ${e.row} 列 ${e.column}] ${e.message}`).join('\n')

  const handleImport = async () => {
    if (!pickedFile) {
      toast.error('请先上传 Excel 文件')
      return
    }

    setIsImporting(true)
    const results: ImportResult[] = []

    try {
      const { template, errors } = await parseTemplateXlsx(pickedFile)

      if (!template) {
        results.push({
          name: pickedFile.name,
          status: 'failed',
          error: errors.length > 0 ? formatErrors(errors) : '文件格式无效',
        })
        setImportResults(results)
        return
      }

      try {
        const unsupportedTypes = new Set<string>()
        const warningParts: string[] = []

        // 解析阶段已校验过 type 在枚举内，这里只做"执行支持度"提示
        const normalizedCheckItems = template.checkItems.map(item => {
          if (!isCheckItemTypeSupported(item.type)) unsupportedTypes.add(item.type)
          return {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: item.name,
            type: item.type,
            config: item.config,
            weight: item.weight,
          }
        })

        if (unsupportedTypes.size > 0) {
          warningParts.push(
            `包含当前版本未支持执行的检查项类型（${Array.from(unsupportedTypes).join('、')}），执行时会跳过`
          )
        }
        if (errors.length > 0) {
          warningParts.push(`已忽略 ${errors.length} 个无效条目：\n${formatErrors(errors)}`)
        }

        const templateData: Partial<InspectionTemplate> = {
          name: template.name,
          description: template.description,
          category: (template.category || 'custom') as TemplateCategory,
          deviceTypes: template.deviceTypes,
          checkItems: normalizedCheckItems,
          isActive: true,
        }

        await createTemplate.mutateAsync(templateData)
        results.push({
          name: template.name,
          status: 'success',
          warning: warningParts.length > 0 ? warningParts.join('；') : undefined,
        })
      } catch (error) {
        results.push({
          name: template.name,
          status: 'failed',
          error: error instanceof Error ? error.message : '导入失败',
        })
      }

      setImportResults(results)

      // 全成功且无警告：自动关闭刷新
      const allSuccess = results.every(r => r.status === 'success')
      const hasWarning = results.some(r => r.warning)
      if (allSuccess && !hasWarning) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (error) {
      toast.error('Excel 解析失败：' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setIsImporting(false)
    }
  }

  const successCount = importResults.filter(r => r.status === 'success').length
  const failedCount = importResults.filter(r => r.status === 'failed').length

  return (
    <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Upload className="w-6 h-6 text-green-600" />
              导入巡检模板
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              支持 Excel (.xlsx) 格式，先下载模板再编辑上传
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-1.5" />
              下载模板
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 文件上传区域 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-foreground mb-4">上传模板文件</h3>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-border hover:border-gray-400'
                  }`}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-700 dark:text-gray-300 mb-2">
                    拖拽 .xlsx 文件到此处,或
                    <button
                      type="button"
                      onClick={handleClickUpload}
                      className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                    >
                      点击选择文件
                    </button>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">仅支持单个模板的 Excel (.xlsx) 文件</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  {pickedFile && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-foreground">{pickedFile.name}</span>
                      <Badge variant="secondary">
                        {(pickedFile.size / 1024).toFixed(1)} KB
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 格式说明 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  Excel 字段说明
                </h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <p>• <strong>Sheet 1 模板信息</strong>：仅 1 行数据，列含 name / description / category / deviceTypes（逗号分隔）</p>
                  <p>• <strong>Sheet 2 检查项</strong>：≥ 1 行数据，列含 name / type / config / weight</p>
                  <p>• <strong>下拉验证</strong>：category 与 type 列在 Excel 中已配置下拉选项</p>
                  <p>• <strong>config 字段</strong>：JSON 字符串（可空填 <code>{`{}`}</code>），如 <code>{`{"oid":"1.3.6.1..."}`}</code></p>
                  <p>• <strong>建议</strong>：先点击右上角"下载模板"获取示例，按格式编辑后上传</p>
                </div>
              </CardContent>
            </Card>

            {/* 导入结果 */}
            {importResults.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">导入结果</h3>
                    <div className="flex items-center gap-3">
                      <Badge variant="success">
                        成功: {successCount}
                      </Badge>
                      {failedCount > 0 && (
                        <Badge variant="danger">
                          失败: {failedCount}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {importResults.map((result, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          result.status === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        }`}
                      >
                        {result.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${
                            result.status === 'success' ? 'text-green-900 dark:text-green-200' : 'text-red-900 dark:text-red-200'
                          }`}>
                            {result.name}
                          </p>
                          {result.status === 'failed' && result.error && (
                            <p className="text-sm text-red-700 dark:text-red-300 mt-1 whitespace-pre-wrap">{result.error}</p>
                          )}
                          {result.status === 'success' && result.warning && (
                            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 whitespace-pre-wrap">
                              提示：{result.warning}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-muted/40">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {importResults.length > 0 && successCount > 0 ? '完成' : '取消'}
          </Button>
          <Button onClick={handleImport} disabled={isImporting || !pickedFile}>
            {isImporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                开始导入
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// 兼容历史：保留 ParsedTemplate 类型导出（其他模块可能引用）
export type { ParsedTemplate }
