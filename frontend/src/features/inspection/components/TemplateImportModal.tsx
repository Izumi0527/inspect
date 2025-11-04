import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Upload, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import {
  Button,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
import { useCreateTemplate } from '../hooks/useInspection'
import { InspectionTemplate } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface ImportResult {
  name: string
  status: 'success' | 'failed'
  error?: string
}

export const TemplateImportModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [jsonContent, setJsonContent] = useState<string>('')
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createTemplate = useCreateTemplate()

  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/json') {
      alert('请选择JSON格式的文件')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setJsonContent(content)
    }
    reader.readAsText(file)
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

  const validateTemplate = (template: Partial<InspectionTemplate>): string | null => {
    if (!template.name || typeof template.name !== 'string') {
      return '模板名称不能为空'
    }
    if (template.name.length > 100) {
      return '模板名称不能超过100个字符'
    }
    if (!template.deviceTypes || !Array.isArray(template.deviceTypes)) {
      return '设备类型必须是数组'
    }
    if (template.deviceTypes.length === 0) {
      return '至少需要一个设备类型'
    }
    if (!template.checkItems || !Array.isArray(template.checkItems)) {
      return '检查项必须是数组'
    }
    if (template.checkItems.length === 0) {
      return '至少需要一个检查项'
    }
    return null
  }

  const handleImport = async () => {
    if (!jsonContent.trim()) {
      alert('请先上传JSON文件或粘贴JSON内容')
      return
    }

    setIsImporting(true)
    const results: ImportResult[] = []

    try {
      const data = JSON.parse(jsonContent)
      const templates = Array.isArray(data) ? data : [data]

      for (const template of templates) {
        const validationError = validateTemplate(template)
        if (validationError) {
          results.push({
            name: template.name || '未命名模板',
            status: 'failed',
            error: validationError
          })
          continue
        }

        try {
          await createTemplate.mutateAsync({
            name: template.name,
            description: template.description || '',
            category: template.category || 'custom',
            deviceTypes: template.deviceTypes,
            checkItems: template.checkItems
          })
          results.push({
            name: template.name,
            status: 'success'
          })
        } catch (error) {
          results.push({
            name: template.name,
            status: 'failed',
            error: error instanceof Error ? error.message : '导入失败'
          })
        }
      }

      setImportResults(results)

      // 如果全部成功,自动关闭并刷新
      const allSuccess = results.every(r => r.status === 'success')
      if (allSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (error) {
      alert('JSON格式错误: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setIsImporting(false)
    }
  }

  const successCount = importResults.filter(r => r.status === 'success').length
  const failedCount = importResults.filter(r => r.status === 'failed').length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-green-50 to-blue-50">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Upload className="w-6 h-6 text-green-600" />
              导入巡检模板
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              支持JSON格式的模板文件导入
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 文件上传区域 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">上传模板文件</h3>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-700 mb-2">
                    拖拽JSON文件到此处,或
                    <button
                      type="button"
                      onClick={handleClickUpload}
                      className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                    >
                      点击选择文件
                    </button>
                  </p>
                  <p className="text-sm text-gray-500">支持单个或多个模板的JSON格式文件</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              </CardContent>
            </Card>

            {/* JSON内容编辑区 */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">JSON内容</h3>
                  {jsonContent && (
                    <Badge variant="secondary">
                      {jsonContent.length} 字符
                    </Badge>
                  )}
                </div>

                <textarea
                  value={jsonContent}
                  onChange={(e) => setJsonContent(e.target.value)}
                  placeholder='粘贴JSON内容或上传文件&#10;示例格式:&#10;{&#10;  "name": "网络设备巡检模板",&#10;  "description": "用于网络设备的定期巡检",&#10;  "category": "network",&#10;  "deviceTypes": ["router", "switch"],&#10;  "checkItems": [&#10;    {&#10;      "id": "1",&#10;      "name": "CPU使用率检查",&#10;      "type": "snmp",&#10;      "config": {},&#10;      "weight": 1&#10;    }&#10;  ]&#10;}'
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </CardContent>
            </Card>

            {/* 格式说明 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  JSON格式说明
                </h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>• <strong>单个模板</strong>: 直接提供一个模板对象</p>
                  <p>• <strong>多个模板</strong>: 提供模板对象的数组 [&#123;...&#125;, &#123;...&#125;]</p>
                  <p>• <strong>必填字段</strong>: name, deviceTypes (至少1个), checkItems (至少1个)</p>
                  <p>• <strong>可选字段</strong>: description, category (默认为 custom)</p>
                </div>
              </CardContent>
            </Card>

            {/* 导入结果 */}
            {importResults.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">导入结果</h3>
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
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        {result.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${
                            result.status === 'success' ? 'text-green-900' : 'text-red-900'
                          }`}>
                            {result.name}
                          </p>
                          {result.error && (
                            <p className="text-sm text-red-700 mt-1">{result.error}</p>
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
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {importResults.length > 0 && successCount > 0 ? '完成' : '取消'}
          </Button>
          <Button onClick={handleImport} disabled={isImporting || !jsonContent.trim()}>
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
