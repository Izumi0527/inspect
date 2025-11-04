import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, FileText, Settings, Users, Plus } from 'lucide-react'
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
  devices: string[]
  strategies: string[]
  executionIds: string[]
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
    devices: [] as string[],
    strategies: [] as string[],
    executionIds: [] as string[],
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await generateReport.mutateAsync({
        dateRange: formData.dateRange,
        devices: formData.devices.length > 0 ? formData.devices : undefined,
        strategies: formData.strategies.length > 0 ? formData.strategies : undefined,
        executionIds: formData.executionIds.length > 0 ? formData.executionIds : undefined,
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
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              生成巡检报告
            </h2>
            <p className="text-sm text-gray-500 mt-1">
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
                <FileText className="w-5 h-5 text-blue-600" />
                基本信息
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    报告描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="请输入报告描述（可选）"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-gray-600">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 时间范围 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                时间范围
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <div className="md:col-span-2 text-sm text-red-500">
                    {errors.dateRange}
                  </div>
                )}
              </div>

              {/* 快速时间选择 */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-gray-600">快速选择：</span>
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
                <Users className="w-5 h-5 text-green-600" />
                筛选条件
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    目标设备 ({formData.devices.length} 个)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 min-h-[80px] bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {formData.devices.map((deviceId) => (
                        <Badge key={deviceId} variant="secondary" className="flex items-center gap-1">
                          设备-{deviceId}
                          <button
                            type="button"
                            onClick={() => {
                              const newDevices = formData.devices.filter(id => id !== deviceId)
                              handleInputChange('devices', newDevices)
                            }}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        // 模拟添加设备
                        const mockDeviceId = `${Date.now()}`
                        handleInputChange('devices', [...formData.devices, mockDeviceId])
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加设备
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">不选择则包含所有设备</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    巡检策略 ({formData.strategies.length} 个)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 min-h-[80px] bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {formData.strategies.map((strategyId) => (
                        <Badge key={strategyId} variant="primary" className="flex items-center gap-1">
                          策略-{strategyId}
                          <button
                            type="button"
                            onClick={() => {
                              const newStrategies = formData.strategies.filter(id => id !== strategyId)
                              handleInputChange('strategies', newStrategies)
                            }}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        // 模拟添加策略
                        const mockStrategyId = `${Date.now()}`
                        handleInputChange('strategies', [...formData.strategies, mockStrategyId])
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加策略
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">不选择则包含所有策略</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    执行记录 ({formData.executionIds.length} 个)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 min-h-[80px] bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {formData.executionIds.map((executionId) => (
                        <Badge key={executionId} variant="outline" className="flex items-center gap-1">
                          执行-{executionId}
                          <button
                            type="button"
                            onClick={() => {
                              const newExecutions = formData.executionIds.filter(id => id !== executionId)
                              handleInputChange('executionIds', newExecutions)
                            }}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        // 模拟添加执行记录
                        const mockExecutionId = `${Date.now()}`
                        handleInputChange('executionIds', [...formData.executionIds, mockExecutionId])
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加记录
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">不选择则包含所有执行记录</p>
                </div>
              </div>
            </div>

            {/* 报告选项 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Settings className="w-5 h-5 text-orange-600" />
                报告选项
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeCharts}
                    onChange={(e) => handleInputChange('includeCharts', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium">包含图表</div>
                    <div className="text-sm text-gray-600">添加可视化图表和统计图</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeDetailData}
                    onChange={(e) => handleInputChange('includeDetailData', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium">包含详细数据</div>
                    <div className="text-sm text-gray-600">添加原始数据和详细信息</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.includeRecommendations}
                    onChange={(e) => handleInputChange('includeRecommendations', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium">包含建议</div>
                    <div className="text-sm text-gray-600">添加优化建议和解决方案</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </form>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
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