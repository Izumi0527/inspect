import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Monitor, Settings, Shield, Plus, Trash2 } from 'lucide-react'
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
import { useCreateTemplate, useUpdateTemplate } from '../hooks/useInspection'
import { InspectionTemplate, InspectionCheckItem } from '../types'

interface Props {
  template: InspectionTemplate | null
  onClose: () => void
  onSuccess: () => void
}

type TemplateCategory = 'network' | 'system' | 'security' | 'custom'

interface TemplateFormData {
  name: string
  description: string
  category: TemplateCategory
  deviceTypes: string[]
  checkItems: InspectionCheckItem[]
}

const createInitialFormState = (): TemplateFormData => ({
  name: '',
  description: '',
  category: 'custom',
  deviceTypes: [],
  checkItems: []
})

const categoryOptions = [
  { value: 'network', label: '网络监控', icon: Monitor, color: 'blue' },
  { value: 'system', label: '系统检查', icon: Settings, color: 'green' },
  { value: 'security', label: '安全检测', icon: Shield, color: 'red' },
  { value: 'custom', label: '自定义', icon: FileText, color: 'purple' }
] as const

const deviceTypeOptions = [
  'router',
  'switch',
  'firewall',
  'server',
  'workstation',
  'storage'
]

export const TemplateModal: React.FC<Props> = ({ template, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<TemplateFormData>(() => createInitialFormState())
  const [errors, setErrors] = useState<Partial<Record<keyof TemplateFormData, string>>>({})
  const [newDeviceType, setNewDeviceType] = useState('')
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const isEditing = !!template

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description,
        category: template.category,
        deviceTypes: [...template.deviceTypes],
        checkItems: [...template.checkItems]
      })
    } else {
      setFormData(createInitialFormState())
    }
  }, [template])

  const handleInputChange = <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
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

  const handleCategoryChange = (value: string) => {
    if (['network', 'system', 'security', 'custom'].includes(value)) {
      handleInputChange('category', value as TemplateCategory)
    }
  }

  const handleAddDeviceType = (deviceType: string) => {
    if (deviceType && !formData.deviceTypes.includes(deviceType)) {
      handleInputChange('deviceTypes', [...formData.deviceTypes, deviceType])
    }
  }

  const handleRemoveDeviceType = (deviceType: string) => {
    handleInputChange('deviceTypes', formData.deviceTypes.filter(dt => dt !== deviceType))
  }

  const handleAddCustomDeviceType = () => {
    const trimmed = newDeviceType.trim()
    if (trimmed && !formData.deviceTypes.includes(trimmed)) {
      handleInputChange('deviceTypes', [...formData.deviceTypes, trimmed])
      setNewDeviceType('')
    }
  }

  const handleAddCheckItem = () => {
    const newCheckItem: InspectionCheckItem = {
      id: Date.now().toString(),
      name: '新检查项',
      type: 'script',
      config: {},
      weight: 1
    }
    handleInputChange('checkItems', [...formData.checkItems, newCheckItem])
  }

  const handleUpdateCheckItem = (index: number, updates: Partial<InspectionCheckItem>) => {
    const newCheckItems = [...formData.checkItems]
    newCheckItems[index] = { ...newCheckItems[index], ...updates }
    handleInputChange('checkItems', newCheckItems)
  }

  const handleRemoveCheckItem = (index: number) => {
    handleInputChange('checkItems', formData.checkItems.filter((_, i) => i !== index))
  }

  const validateForm = () => {
    const newErrors: Partial<Record<keyof TemplateFormData, string>> = {}

    // 模板名称：必填，长度1-100字符
    if (!formData.name.trim()) {
      newErrors.name = '请输入模板名称'
    } else if (formData.name.length > 100) {
      newErrors.name = '模板名称不能超过100个字符'
    }

    // 设备类型：至少选择一个
    if (formData.deviceTypes.length === 0) {
      newErrors.deviceTypes = '请选择至少一种设备类型'
    }

    // 检查项：至少添加一个
    if (formData.checkItems.length === 0) {
      newErrors.checkItems = '请添加至少一个检查项'
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
      if (isEditing && template) {
        await updateTemplate.mutateAsync({
          id: template.id,
          data: formData
        })
      } else {
        await createTemplate.mutateAsync(formData)
      }
      onSuccess()
    } catch (error) {
      console.error('Save template failed:', error)
    }
  }

  const isLoading = createTemplate.isPending || updateTemplate.isPending

  const getCategoryIcon = (category: TemplateCategory) => {
    const option = categoryOptions.find(opt => opt.value === category)
    return option?.icon || FileText
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              {React.createElement(getCategoryIcon(formData.category), { className: 'w-6 h-6' })}
              {isEditing ? '编辑巡检模板' : '创建巡检模板'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              配置巡检模板的基本信息和检查项
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2 text-foreground">
                <FileText className="w-5 h-5 text-blue-600" />
                基本信息
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    模板名称 *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="请输入模板名称"
                    className={errors.name ? 'border-red-500' : ''}
                    maxLength={100}
                  />
                  <div className="flex justify-between items-center mt-1">
                    {errors.name ? (
                      <p className="text-sm text-red-500">{errors.name}</p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">模板名称长度1-100字符</p>
                    )}
                    <span className={`text-xs ${formData.name.length > 100 ? 'text-red-500' : 'text-gray-400'}`}>
                      {formData.name.length}/100
                    </span>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    模板描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="请输入模板描述(可选)"
                    maxLength={500}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 ${
                      errors.description ? 'border-red-500' : 'border-border'
                    }`}
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">模板描述最多500字符</p>
                    <span className={`text-xs ${formData.description.length > 500 ? 'text-red-500' : 'text-gray-400'}`}>
                      {formData.description.length}/500
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    模板类别
                  </label>
                  <Select
                    value={formData.category}
                    onValueChange={handleCategoryChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择模板类别" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {React.createElement(option.icon, { className: 'w-4 h-4' })}
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 设备类型 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2 text-foreground">
                <Monitor className="w-5 h-5 text-purple-600" />
                支持设备类型 *
              </h3>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  常用设备类型
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {deviceTypeOptions.map((deviceType) => {
                    const isSelected = formData.deviceTypes.includes(deviceType)
                    return (
                      <Button
                        key={deviceType}
                        type="button"
                        variant={isSelected ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            handleRemoveDeviceType(deviceType)
                          } else {
                            handleAddDeviceType(deviceType)
                          }
                        }}
                      >
                        {deviceType}
                      </Button>
                    )
                  })}
                </div>

                <div className="flex gap-2 mb-2">
                  <Input
                    value={newDeviceType}
                    onChange={(e) => setNewDeviceType(e.target.value)}
                    placeholder="输入自定义设备类型"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCustomDeviceType()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddCustomDeviceType}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {formData.deviceTypes.length > 0 && (
                  <div className="border border-border rounded-lg p-3 bg-muted/40">
                    <div className="flex flex-wrap gap-2">
                      {formData.deviceTypes.map((deviceType) => (
                        <Badge key={deviceType} variant="secondary" className="flex items-center gap-1">
                          {deviceType}
                          <button
                            type="button"
                            onClick={() => handleRemoveDeviceType(deviceType)}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {errors.deviceTypes && (
                  <p className="text-sm text-red-500 mt-1">{errors.deviceTypes}</p>
                )}
              </div>
            </div>

            {/* 检查项配置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium flex items-center gap-2 text-foreground">
                  <Settings className="w-5 h-5 text-green-600" />
                  检查项配置 * ({formData.checkItems.length} 项)
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCheckItem}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加检查项
                </Button>
              </div>

              {formData.checkItems.length > 0 ? (
                <div className="space-y-3">
                  {formData.checkItems.map((checkItem, index) => (
                    <div key={checkItem.id} className="border border-border rounded-lg p-4 bg-muted/40">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={checkItem.name}
                            onChange={(e) => handleUpdateCheckItem(index, { name: e.target.value })}
                            placeholder="检查项名称"
                          />
                          <Select
                            value={checkItem.type}
                            onValueChange={(value) => handleUpdateCheckItem(index, { type: value as InspectionCheckItem['type'] })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="检查类型" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="snmp">SNMP</SelectItem>
                              <SelectItem value="ssh">SSH</SelectItem>
                              <SelectItem value="http">HTTP</SelectItem>
                              <SelectItem value="ping">Ping</SelectItem>
                              <SelectItem value="script">Script</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCheckItem(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">暂无检查项，点击"添加检查项"按钮开始配置</p>
                </div>
              )}
              {errors.checkItems && (
                <p className="text-sm text-red-500">{errors.checkItems}</p>
              )}
            </div>
          </div>
        </form>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t dark:border-gray-700 bg-muted/40">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            取消
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '保存中...' : isEditing ? '保存修改' : '创建模板'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
