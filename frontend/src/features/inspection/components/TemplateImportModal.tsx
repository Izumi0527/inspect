import React, { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Badge, Card, CardContent } from '@/components/atoms'
import { SimpleModal } from '@/components/atoms/modal'
import { cn } from '@/utils/cn'
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

export const TemplateImportModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createTemplate = useCreateTemplate()

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const handleFileSelect = (file: File) => {
    if (!XLSX_EXTENSIONS.test(file.name)) {
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
    e.target.value = ''
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const handleDownloadTemplate = async () => {
    let url: string | null = null
    try {
      const blob = await buildTemplateXlsx()
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '巡检模板导入模板.xlsx'
      a.click()
      toast.success('模板已下载，请在 Excel/WPS 中编辑后上传')
    } catch (downloadError) {
      toast.error(
        '模板下载失败：' +
          (downloadError instanceof Error ? downloadError.message : '未知错误')
      )
    } finally {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }

  const formatErrors = (errors: ParseError[]): string =>
    errors
      .map((e) => `[Sheet ${e.sheet} 行 ${e.row} 列 ${e.column}] ${e.message}`)
      .join('\n')

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

        const normalizedCheckItems = template.checkItems.map((item) => {
          if (!isCheckItemTypeSupported(item.type)) unsupportedTypes.add(item.type)
          return {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: item.name,
            type: item.type,
            metric: item.metric,
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
      } catch (createError) {
        results.push({
          name: template.name,
          status: 'failed',
          error: createError instanceof Error ? createError.message : '导入失败',
        })
      }

      setImportResults(results)

      const allSuccess = results.every((r) => r.status === 'success')
      const hasWarning = results.some((r) => r.warning)
      if (allSuccess && !hasWarning) {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current)
        }
        closeTimerRef.current = setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (parseError) {
      toast.error(
        'Excel 解析失败：' +
          (parseError instanceof Error ? parseError.message : '未知错误')
      )
    } finally {
      setIsImporting(false)
    }
  }

  const successCount = importResults.filter((r) => r.status === 'success').length
  const failedCount = importResults.filter((r) => r.status === 'failed').length

  return (
    <SimpleModal
      open
      onClose={() => {
        if (!isImporting) {
          onClose()
        }
      }}
      ariaLabel="导入巡检模板"
      size="3xl"
    >
      <div className="flex flex-col gap-5">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4 pr-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-soft-foreground">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">导入巡检模板</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                支持 Excel (.xlsx) 格式，先下载模板再编辑上传
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 mr-1.5" />
            下载模板
          </Button>
        </div>

        {/* 内容区 */}
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1 space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">上传模板文件</h3>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  'border-2 border-dashed rounded-lg p-7 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface-2/40 hover:border-primary/50'
                )}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2.5" />
                <p className="text-sm text-foreground mb-1.5">
                  拖拽 .xlsx 文件到此处，或
                  <button
                    type="button"
                    onClick={handleClickUpload}
                    className="text-primary hover:underline font-medium ml-1 cursor-pointer"
                  >
                    点击选择文件
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  仅支持单个模板的 Excel (.xlsx) 文件
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {pickedFile && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-success-soft text-success-soft-foreground text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{pickedFile.name}</span>
                    <Badge variant="secondary" size="sm">
                      {(pickedFile.size / 1024).toFixed(1)} KB
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary" />
                Excel 字段说明
              </h3>
              <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <p>
                  • <strong className="text-foreground">Sheet 1 模板信息</strong>：仅 1 行数据，列含 name / description / category / 适用设备类型（交换机、路由器、防火墙、服务器之一）
                </p>
                <p>
                  • <strong className="text-foreground">Sheet 2 检查项</strong>：≥ 1 行数据，列含 name / type / config / weight / metric（SNMP 检查项必填采集指标）
                </p>
                <p>
                  • <strong className="text-foreground">下拉验证</strong>：category、适用设备类型与 type 列在 Excel 中已配置下拉选项
                </p>
                <p>
                  • <strong className="text-foreground">config 字段</strong>：JSON 字符串（可空填 <code className="font-mono text-foreground">{`{}`}</code>），如 <code className="font-mono text-foreground">{`{"oid":"1.3.6.1..."}`}</code>
                </p>
                <p>
                  • <strong className="text-foreground">建议</strong>：先点击右上角“下载模板”获取示例，按格式编辑后上传
                </p>
              </div>
            </CardContent>
          </Card>

          {importResults.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">导入结果</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" size="sm">
                      成功: {successCount}
                    </Badge>
                    {failedCount > 0 && (
                      <Badge variant="error" size="sm">
                        失败: {failedCount}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {importResults.map((result, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border border-border',
                        result.status === 'success'
                          ? 'bg-success-soft text-success-soft-foreground'
                          : 'bg-danger-soft text-danger-soft-foreground'
                      )}
                    >
                      {result.status === 'success' ? (
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{result.name}</p>
                        {result.status === 'failed' && result.error && (
                          <p className="text-xs mt-1 whitespace-pre-wrap">{result.error}</p>
                        )}
                        {result.status === 'success' && result.warning && (
                          <div className="mt-1.5 rounded bg-warning-soft px-2 py-1 text-xs text-warning-soft-foreground whitespace-pre-wrap">
                            提示：{result.warning}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
            className="cursor-pointer"
          >
            {importResults.length > 0 && successCount > 0 ? '完成' : '取消'}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            loading={isImporting}
            disabled={isImporting || !pickedFile}
            className="cursor-pointer"
          >
            {!isImporting && <Upload className="w-4 h-4 mr-1.5" />}
            {isImporting ? '导入中...' : '开始导入'}
          </Button>
        </div>
      </div>
    </SimpleModal>
  )
}

export type { ParsedTemplate }
