import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, FileText, Settings, Users } from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge
} from '@/components/atoms'
import { useGenerateInspectionReport } from '../hooks/useReports'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type ReportCategoryOption = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
type ReportFormatOption = 'pdf' | 'excel' | 'html' | 'word'

interface InspectionReportForm {
  title: string
  description: string
  category: ReportCategoryOption
  format: ReportFormatOption
  dateRange: {
    startDate: string
    endDate: string
  }
  deviceIdsText: string
  includeCharts: boolean
  includeDetailData: boolean
  includeRecommendations: boolean
}

export const InspectionReportModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState<InspectionReportForm>({
    title: '',
    description: '',
    category: 'custom',
    format: 'pdf',
    dateRange: {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7天前
      endDate: new Date().toISOString().split('T')[0] // 今天
    },
    deviceIdsText: '',
    includeCharts: true,
    includeDetailData: true,
    includeRecommendations: true
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const generateReport = useGenerateInspectionReport()

  const handleInputChange = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // 清除字段错误
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  const handleDateRangeChange = (field: 'startDate' | 'endDate', value: string) => {
    setFormData(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [field]: value
      }
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = '请输入报告标题'
    }

    if (!formData.dateRange.startDate) {
      newErrors.startDate = '请选择开始日期'
    }

    if (!formData.dateRange.endDate) {
      newErrors.endDate = '请选择结束日期'
    }

    if (formData.dateRange.startDate && formData.dateRange.endDate) {
      if (new Date(formData.dateRange.startDate) >= new Date(formData.dateRange.endDate)) {
        newErrors.dateRange = '开始日期必须早于结束日期'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const parsedDeviceIds = useMemo(() => {
    const raw = String(formData.deviceIdsText || '').trim()
    if (!raw) return [] as string[]
    const parts = raw.split(/[,\uFF0C]+/g)
    const seen = new Set<string>()
    const result: string[] = []
    for (const part of parts) {
      const v = part.trim()
      if (!v) continue
      if (seen.has(v)) continue
      seen.add(v)
      result.push(v)
    }
    return result
  }, [formData.deviceIdsText])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await generateReport.mutateAsync({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        dateRange: formData.dateRange,
        devices: parsedDeviceIds.length > 0 ? parsedDeviceIds : undefined,
        format: formData.format,
        includeCharts: formData.includeCharts,
        includeDetailData: formData.includeDetailData,
        includeRecommendations: formData.includeRecommendations
      })
      onSuccess()
    } catch (error) {
      console.error('Generate report failed:', error)
    }
  }

  const categoryOptions: Array<{ value: ReportCategoryOption; label: string }> = [
    { value: 'daily', label: '日报' },
    { value: 'weekly', label: '周报' },
    { value: 'monthly', label: '月报' },
    { value: 'quarterly', label: '季报' },
    { value: 'yearly', label: '年报' },
    { value: 'custom', label: '自定义' }
  ]

  const formatOptions: Array<{ value: ReportFormatOption; label: string; description: string }> = [
    { value: 'pdf', label: 'PDF', description: '适合打印和分享' },
    { value: 'excel', label: 'Excel', description: '适合数据分析' },
    { value: 'html', label: 'HTML', description: '适合在线查看' },
    { value: 'word', label: 'Word', description: '适合编辑修改' }
  ]

  const isLoading = generateReport.isPending

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              生成巡检报告
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              配置报告参数并生成详细的巡检分析报告
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                基本信息
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    报告标题 *
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="请输入报告标题"
                    error={errors.title}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    报告描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="请输入报告描述（可选）"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-card text-foreground"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    报告类别
                  </label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => handleInputChange('category', value as ReportCategoryOption)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择报告类别" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    输出格式
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {formatOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleInputChange('format', option.value)}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          formData.format === option.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200'
                            : 'border-border hover:border-border/80 dark:hover:border-border'
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 时间范围 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                时间范围
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    开始日期 *
                  </label>
                  <Input
                    type="date"
                    value={formData.dateRange.startDate}
                    onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
                    error={errors.startDate}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    结束日期 *
                  </label>
                  <Input
                    type="date"
                    value={formData.dateRange.endDate}
                    onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
                    error={errors.endDate}
                  />
                </div>

                {errors.dateRange && (
                  <div className="md:col-span-2 text-sm text-red-500 dark:text-red-400">
                    {errors.dateRange}
                  </div>
                )}
              </div>

              {/* 快速时间选择 */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">快速选择：</span>
                {[
                  { label: '最近7天', days: 7 },
                  { label: '最近30天', days: 30 },
                  { label: '最近90天', days: 90 },
                  { label: '本月', days: 'month' },
                  { label: '上月', days: 'lastMonth' }
                ].map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      let startDate: string
                      let endDate = new Date().toISOString().split('T')[0]
                      
                      if (typeof option.days === 'number') {
                        startDate = new Date(Date.now() - option.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                      } else if (option.days === 'month') {
                        const now = new Date()
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
                      } else { // lastMonth
                        const now = new Date()
                        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
                        startDate = lastMonth.toISOString().split('T')[0]
                        endDate = lastMonthEnd.toISOString().split('T')[0]
                      }

                      setFormData(prev => ({
                        ...prev,
                        dateRange: { startDate, endDate }
                      }))
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* 筛选条件 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                筛选条件
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    目标设备ID（可选）
                  </label>
                  <Input
                    value={formData.deviceIdsText}
                    onChange={(e) => handleInputChange('deviceIdsText', e.target.value)}
                    placeholder="例如：1,2,3；留空代表全部设备"
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {parsedDeviceIds.map((id) => (
                      <Badge key={id} variant="secondary">
                        设备-{id}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    当前仅支持按设备ID过滤（策略/执行记录筛选暂未对接后端，已移除模拟按钮避免生成空报表）。
                  </p>
                </div>
              </div>
            </div>

            {/* 报告选项 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Settings className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                报告选项
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeCharts}
                    onChange={(e) => handleInputChange('includeCharts', e.target.checked)}
                    className="rounded border-border text-blue-600 focus:ring-blue-500 dark:bg-muted/80"
                  />
                  <div>
                    <div className="font-medium text-foreground">包含图表</div>
                    <div className="text-sm text-muted-foreground">添加可视化图表和统计图</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeDetailData}
                    onChange={(e) => handleInputChange('includeDetailData', e.target.checked)}
                    className="rounded border-border text-blue-600 focus:ring-blue-500 dark:bg-muted/80"
                  />
                  <div>
                    <div className="font-medium text-foreground">包含详细数据</div>
                    <div className="text-sm text-muted-foreground">添加原始数据和详细信息</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeRecommendations}
                    onChange={(e) => handleInputChange('includeRecommendations', e.target.checked)}
                    className="rounded border-border text-blue-600 focus:ring-blue-500 dark:bg-muted/80"
                  />
                  <div>
                    <div className="font-medium text-foreground">包含建议</div>
                    <div className="text-sm text-muted-foreground">添加优化建议和解决方案</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </form>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t dark:border-border bg-muted/40">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            取消
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '生成中...' : '生成报告'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
