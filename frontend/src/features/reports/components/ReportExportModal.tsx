import React, { useState } from 'react'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { motion } from 'framer-motion'
import {
  FileText,
  Download,
  CheckCircle,
  AlertTriangle,
  X,
  Calendar
} from 'lucide-react'
import {
  Modal,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Loading,
  Badge
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ReportExportModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ReportTemplate {
  type: string
  name: string
  description: string
  fields: string[]
  icon?: React.ComponentType<{ className?: string }>
}

interface ExportRequest {
  report_type: string
  format: 'pdf' | 'word'
  title?: string
  subtitle?: string
  date_range?: {
    start_date: string
    end_date: string
  }
}

interface ExportResult {
  success: boolean
  message: string
  download_url?: string
  file_size?: number
  expires_at?: string
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    type: 'device_summary',
    name: '设备汇总报表',
    description: '包含设备统计信息、状态分布和设备列表',
    fields: ['总设备数', '在线设备', '离线设备', '告警设备'],
    icon: FileText
  },
  {
    type: 'inspection_report',
    name: '巡检结果报表',
    description: '设备巡检任务执行结果和问题汇总',
    fields: ['巡检任务', '执行状态', '发现问题', '处理建议'],
    icon: CheckCircle
  },
  {
    type: 'alert_report',
    name: '告警统计报表',
    description: '系统告警统计分析和趋势展示',
    fields: ['告警数量', '告警等级', '处理状态', '趋势分析'],
    icon: AlertTriangle
  },
  {
    type: 'performance_report',
    name: '性能分析报表',
    description: '设备性能指标分析和优化建议',
    fields: ['CPU使用率', '内存使用率', '网络流量', '性能趋势'],
    icon: FileText
  }
]

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  onClose
}) => {
  const [currentStep, setCurrentStep] = useState<'select' | 'configure' | 'export'>('select')
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [exportRequest, setExportRequest] = useState<ExportRequest>({
    report_type: '',
    format: 'pdf'
  })
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)

  const handleTemplateSelect = (template: ReportTemplate) => {
    setSelectedTemplate(template)
    setExportRequest(prev => ({
      ...prev,
      report_type: template.type,
      title: template.name,
      subtitle: `生成时间: ${formatDateTimeYMDHMS(new Date())}`
    }))
    setCurrentStep('configure')
  }

  const handleExport = async () => {
    if (!selectedTemplate) return
    
    setIsExporting(true)
    try {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const result: ExportResult = {
        success: true,
        message: `${selectedTemplate.name}导出成功`,
        download_url: `/api/reports/download/report_${Date.now()}.${exportRequest.format}`,
        file_size: Math.floor(Math.random() * 2000000) + 500000, // 500KB-2.5MB
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
      
      setExportResult(result)
      setCurrentStep('export')
    } catch {
      setExportResult({
        success: false,
        message: '导出失败，请重试'
      })
      setCurrentStep('export')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = () => {
    if (exportResult?.download_url) {
      // 模拟文件下载
      const link = document.createElement('a')
      link.href = exportResult.download_url
      link.download = `${selectedTemplate?.name || 'report'}.${exportRequest.format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const resetModal = () => {
    setCurrentStep('select')
    setSelectedTemplate(null)
    setExportRequest({ report_type: '', format: 'pdf' })
    setExportResult(null)
    setIsExporting(false)
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  const renderSelectStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
          <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">选择报表模板</h3>
        <p className="text-sm text-muted-foreground">
          请选择要导出的报表类型
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORT_TEMPLATES.map((template) => {
          const IconComponent = template.icon || FileText
          return (
            <motion.div
              key={template.type}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTemplateSelect(template)}
              className="cursor-pointer"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                      <IconComponent className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-1">
                        {template.name}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        {template.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {template.fields.slice(0, 3).map((field, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                        {template.fields.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{template.fields.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )

  const renderConfigureStep = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('select')}
        >
          ← 返回
        </Button>
        <div>
          <h3 className="text-lg font-semibold text-foreground">配置报表</h3>
          <p className="text-sm text-muted-foreground">{selectedTemplate?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 基本设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">基本设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                报表标题
              </label>
              <Input
                value={exportRequest.title || ''}
                onChange={(e) => setExportRequest(prev => ({ ...prev, title: e.target.value }))}
                placeholder="输入报表标题"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                副标题
              </label>
              <Input
                value={exportRequest.subtitle || ''}
                onChange={(e) => setExportRequest(prev => ({ ...prev, subtitle: e.target.value }))}
                placeholder="输入副标题"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                导出格式
              </label>
              <Select
                value={exportRequest.format}
                onValueChange={(value: 'pdf' | 'word') =>
                  setExportRequest(prev => ({ ...prev, format: value }))
                }
              >
                <SelectTrigger aria-label="导出格式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">
                    <div>
                      <div className="font-medium">PDF格式</div>
                      <div className="text-xs text-muted-foreground">便于打印和存档</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="word">
                    <div>
                      <div className="font-medium">Word文档</div>
                      <div className="text-xs text-muted-foreground">可编辑的文档格式</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 时间范围 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              时间范围
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                开始日期
              </label>
              <Input
                type="date"
                value={exportRequest.date_range?.start_date || ''}
                onChange={(e) => setExportRequest(prev => ({
                  ...prev,
                  date_range: {
                    ...prev.date_range,
                    start_date: e.target.value,
                    end_date: prev.date_range?.end_date || ''
                  }
                }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-2">
                结束日期
              </label>
              <Input
                type="date"
                value={exportRequest.date_range?.end_date || ''}
                onChange={(e) => setExportRequest(prev => ({
                  ...prev,
                  date_range: {
                    ...prev.date_range,
                    start_date: prev.date_range?.start_date || '',
                    end_date: e.target.value
                  }
                }))}
              />
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>提示：</strong>不选择日期将生成全部数据的报表
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep('select')}
        >
          上一步
        </Button>
        <Button
          onClick={handleExport}
          disabled={isExporting || !selectedTemplate}
        >
          {isExporting ? (
            <>
              <Loading size="sm" className="mr-2" />
              正在生成...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              生成报表
            </>
          )}
        </Button>
      </div>
    </div>
  )

  const renderExportStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        {exportResult?.success ? (
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        ) : (
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        )}

        <h3 className="text-lg font-semibold text-foreground mb-2">
          {exportResult?.success ? '导出成功' : '导出失败'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {exportResult?.message}
        </p>
      </div>

      {exportResult?.success && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">报表类型</span>
                <span className="text-sm font-medium">
                  {selectedTemplate?.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">文件格式</span>
                <span className="text-sm font-medium uppercase">
                  {exportRequest.format}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">文件大小</span>
                <span className="text-sm font-medium">
                  {exportResult.file_size ?
                    `${(exportResult.file_size / 1024).toFixed(1)} KB` :
                    '--'
                  }
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">过期时间</span>
                <span className="text-sm font-medium">
                  {exportResult.expires_at ?
                    formatDateTimeYMDHMS(exportResult.expires_at) :
                    '24小时后'
                  }
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-3">
        {exportResult?.success && (
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            立即下载
          </Button>
        )}
        <Button
          variant={exportResult?.success ? "outline" : "default"}
          onClick={exportResult?.success ? handleClose : () => setCurrentStep('configure')}
        >
          {exportResult?.success ? '完成' : '重新配置'}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <div className="p-6">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">导出报表</h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 步骤指示器 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[
              { key: 'select', title: '选择模板' },
              { key: 'configure', title: '配置报表' },
              { key: 'export', title: '导出完成' }
            ].map((step, index) => {
              const isActive = step.key === currentStep
              const isCompleted = ['select', 'configure', 'export']
                .indexOf(currentStep) > index

              return (
                <React.Fragment key={step.key}>
                  <div className="flex items-center">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                      ${isActive ? 'bg-blue-600 text-white' : ''}
                      ${isCompleted ? 'bg-green-600 text-white' : ''}
                      ${!isActive && !isCompleted ? 'bg-muted text-muted-foreground' : ''}
                    `}>
                      {isCompleted ? <CheckCircle className="h-4 w-4" /> : index + 1}
                    </div>
                    <span className="ml-2 text-sm font-medium text-foreground">
                      {step.title}
                    </span>
                  </div>
                  {index < 2 && (
                    <div className="flex-1 mx-4">
                      <div className={`h-1 rounded ${
                        isCompleted ? 'bg-green-600' : 'bg-muted'
                      }`} />
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* 步骤内容 */}
        <div className="min-h-[400px]">
          {currentStep === 'select' && renderSelectStep()}
          {currentStep === 'configure' && renderConfigureStep()}
          {currentStep === 'export' && renderExportStep()}
        </div>
      </div>
    </Modal>
  )
}
