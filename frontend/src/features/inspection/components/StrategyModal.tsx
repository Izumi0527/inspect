import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, Users, FileText, Plus } from 'lucide-react'
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
import { useCreateStrategy, useUpdateStrategy } from '../hooks/useInspection'
import { InspectionStrategy } from '../types'

interface Props {
  strategy: InspectionStrategy | null
  onClose: () => void
  onSuccess: () => void
}

type StrategyType = 'scheduled' | 'manual'

interface StrategyFormData {
  name: string
  description: string
  type: StrategyType
  cron: string
  devices: number[]
  templates: number[]
  enabled: boolean
}

const createInitialFormState = (): StrategyFormData => ({
  name: '',
  description: '',
  type: 'scheduled',
  cron: '0 0 2 * * ?',
  devices: [],
  templates: [],
  enabled: true
})

export const StrategyModal: React.FC<Props> = ({ strategy, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<StrategyFormData>(() => createInitialFormState())
  const [errors, setErrors] = useState<Partial<Record<keyof StrategyFormData, string>>>({})
  const createStrategy = useCreateStrategy()
  const updateStrategy = useUpdateStrategy()

  const isEditing = !!strategy

  useEffect(() => {
    if (strategy) {
      setFormData({
        name: strategy.name,
        description: strategy.description,
        type: strategy.type,
        cron: strategy.cron || '0 0 2 * * ?',
        devices: [...strategy.devices],
        templates: [...strategy.templates],
        enabled: strategy.enabled
      })
    } else {
      setFormData(createInitialFormState())
    }
  }, [strategy])

  const handleInputChange = <K extends keyof StrategyFormData>(field: K, value: StrategyFormData[K]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }))
    }
  }

  const handleTypeChange = (value: string) => {
    if (value === 'scheduled' || value === 'manual') {
      handleInputChange('type', value)
    }
  }

  const validateForm = () => {
    const newErrors: Partial<Record<keyof StrategyFormData, string>> = {}

    // 策略名称：必填，长度1-100字符
    if (!formData.name.trim()) {
      newErrors.name = '请输入策略名称'
    } else if (formData.name.length > 100) {
      newErrors.name = '策略名称不能超过100个字符'
    }

    // 策略描述：必填，最多500字符
    if (!formData.description.trim()) {
      newErrors.description = '请输入策略描述'
    } else if (formData.description.length > 500) {
      newErrors.description = '策略描述不能超过500个字符'
    }

    // Cron表达式：定时策略必填，最多100字符
    if (formData.type === 'scheduled') {
      if (!formData.cron.trim()) {
        newErrors.cron = '请输入Cron表达式'
      } else if (formData.cron.length > 100) {
        newErrors.cron = 'Cron表达式不能超过100个字符'
      }
    }

    // 设备：至少选择一个
    if (formData.devices.length === 0) {
      newErrors.devices = '请选择至少一个设备'
    }

    // 模板：至少选择一个
    if (formData.templates.length === 0) {
      newErrors.templates = '请选择至少一个模板'
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
      if (isEditing && strategy) {
        await updateStrategy.mutateAsync({
          id: strategy.id,
          data: formData
        })
      } else {
        await createStrategy.mutateAsync(formData)
      }
      onSuccess()
    } catch (error) {
      console.error('Save strategy failed:', error)
    }
  }

  const cronPresets = [
    { label: '每天凌晨2点', value: '0 0 2 * * ?' },
    { label: '每小时执行', value: '0 0 * * * ?' },
    { label: '每30分钟执行', value: '0 */30 * * * ?' },
    { label: '每周一凌晨2点', value: '0 0 2 ? * MON' },
    { label: '每月1号凌晨2点', value: '0 0 2 1 * ?' }
  ]

  const isLoading = createStrategy.isPending || updateStrategy.isPending

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditing ? '编辑巡检策略' : '创建巡检策略'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              配置巡检策略的基本信息和执行规则
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
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
                    策略名称 *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="请输入策略名称"
                    className={errors.name ? 'border-red-500' : ''}
                    maxLength={100}
                  />
                  <div className="flex justify-between items-center mt-1">
                    {errors.name ? (
                      <p className="text-sm text-red-500">{errors.name}</p>
                    ) : (
                      <p className="text-xs text-gray-500">策略名称长度1-100字符</p>
                    )}
                    <span className={`text-xs ${formData.name.length > 100 ? 'text-red-500' : 'text-gray-400'}`}>
                      {formData.name.length}/100
                    </span>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    策略描述 *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="请输入策略描述"
                    maxLength={500}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.description ? 'border-red-500' : 'border-gray-300'
                    }`}
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-1">
                    {errors.description ? (
                      <p className="text-sm text-red-500">{errors.description}</p>
                    ) : (
                      <p className="text-xs text-gray-500">策略描述最多500字符</p>
                    )}
                    <span className={`text-xs ${formData.description.length > 500 ? 'text-red-500' : 'text-gray-400'}`}>
                      {formData.description.length}/500
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    策略类型 *
                  </label>
                  <Select
                    value={formData.type}
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择策略类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">定时巡检</SelectItem>
                      <SelectItem value="manual">手动巡检</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => handleInputChange('enabled', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">启用策略</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 执行时间配置 */}
            {formData.type === 'scheduled' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  执行时间
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cron表达式 *
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.cron}
                      onChange={(e) => handleInputChange('cron', e.target.value)}
                      placeholder="0 0 2 * * ?"
                      error={errors.cron}
                      className="flex-1"
                    />
                    <Select onValueChange={(value) => handleInputChange('cron', value)}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="常用预设" />
                      </SelectTrigger>
                      <SelectContent>
                        {cronPresets.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    格式：秒 分 时 日 月 周，例如：0 0 2 * * ? 表示每天凌晨2点执行
                  </p>
                </div>
              </div>
            )}

            {/* 设备和模板选择 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                目标配置
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    目标设备 * ({formData.devices.length} 个)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 min-h-[100px] bg-gray-50">
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
                        const mockDeviceId = Date.now()
                        handleInputChange('devices', [...formData.devices, mockDeviceId])
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加设备
                    </Button>
                  </div>
                  {errors.devices && (
                    <p className="text-sm text-red-500 mt-1">{errors.devices}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    巡检模板 * ({formData.templates.length} 个)
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 min-h-[100px] bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {formData.templates.map((templateId) => (
                        <Badge key={templateId} variant="primary" className="flex items-center gap-1">
                          模板-{templateId}
                          <button
                            type="button"
                            onClick={() => {
                              const newTemplates = formData.templates.filter(id => id !== templateId)
                              handleInputChange('templates', newTemplates)
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
                        const mockTemplateId = Date.now()
                        handleInputChange('templates', [...formData.templates, mockTemplateId])
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加模板
                    </Button>
                  </div>
                  {errors.templates && (
                    <p className="text-sm text-red-500 mt-1">{errors.templates}</p>
                  )}
                </div>
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
            {isLoading ? '保存中...' : isEditing ? '保存修改' : '创建策略'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
