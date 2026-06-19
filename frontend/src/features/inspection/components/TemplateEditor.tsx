/**
 * 模板编辑器组件
 * 支持创建和编辑巡检模板
 */

import { useState } from 'react'
import { CheckItemEditor } from './CheckItemEditor'
import type { InspectionTemplate, InspectionCheckItem, TemplateCategory } from '../types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TemplateEditorProps {
  template?: InspectionTemplate
  onSave: (data: Omit<InspectionTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  isLoading?: boolean
}

interface FormData {
  name: string
  description: string
  category: TemplateCategory
  deviceTypes: string[]
  checkItems: InspectionCheckItem[]
  isActive: boolean
}

export function TemplateEditor({
  template,
  onSave,
  onCancel,
  isLoading = false,
}: TemplateEditorProps) {
  const [formData, setFormData] = useState<FormData>({
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || 'custom',
    deviceTypes: template?.deviceTypes || [],
    checkItems: template?.checkItems || [],
    isActive: template?.isActive ?? true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingItem, setEditingItem] = useState<InspectionCheckItem | null>(null)
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [showItemEditor, setShowItemEditor] = useState(false)

  // 厂商和设备类型选项
  const vendorOptions = ['Huawei', 'H3C']
  const deviceTypeOptions = ['router', 'switch', 'firewall']

  // 验证表单
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = '模板名称不能为空'
    }

    if (formData.deviceTypes.length === 0) {
      newErrors.deviceTypes = '至少选择一个设备类型'
    }

    if (formData.checkItems.length === 0) {
      newErrors.checkItems = '至少添加一个检查项'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 处理保存
  const handleSave = () => {
    if (validateForm()) {
      onSave({
        name: formData.name,
        description: formData.description,
        category: formData.category,
        deviceTypes: formData.deviceTypes,
        checkItems: formData.checkItems,
        isActive: formData.isActive,
        isBuiltIn: false,
      })
    }
  }

  // 更新基本字段
  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 切换设备类型选择
  const toggleDeviceType = (type: string) => {
    setFormData((prev) => {
      const deviceTypes = prev.deviceTypes.includes(type)
        ? prev.deviceTypes.filter((t) => t !== type)
        : [...prev.deviceTypes, type]
      return { ...prev, deviceTypes }
    })
  }

  // 添加检查项
  const handleAddItem = () => {
    setEditingItem(null)
    setEditingIndex(-1)
    setShowItemEditor(true)
  }

  // 编辑检查项
  const handleEditItem = (item: InspectionCheckItem, index: number) => {
    setEditingItem(item)
    setEditingIndex(index)
    setShowItemEditor(true)
  }

  // 保存检查项
  const handleSaveItem = (item: InspectionCheckItem) => {
    setFormData((prev) => {
      const checkItems = [...prev.checkItems]
      if (editingIndex >= 0) {
        checkItems[editingIndex] = item
      } else {
        checkItems.push(item)
      }
      return { ...prev, checkItems }
    })
    setShowItemEditor(false)
    setEditingItem(null)
    setEditingIndex(-1)
  }

  // 删除检查项
  const handleDeleteItem = (index: number) => {
    if (confirm('确定要删除这个检查项吗？')) {
      setFormData((prev) => ({
        ...prev,
        checkItems: prev.checkItems.filter((_, i) => i !== index),
      }))
    }
  }

  // 移动检查项
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= formData.checkItems.length) return

    setFormData((prev) => {
      const checkItems = [...prev.checkItems]
      const temp = checkItems[index]
      checkItems[index] = checkItems[newIndex]
      checkItems[newIndex] = temp
      return { ...prev, checkItems }
    })
  }

  // 如果正在编辑检查项，显示编辑器
  if (showItemEditor) {
    return (
      <CheckItemEditor
        item={editingItem || undefined}
        onSave={handleSaveItem}
        onCancel={() => {
          setShowItemEditor(false)
          setEditingItem(null)
          setEditingIndex(-1)
        }}
      />
    )
  }

  return (
    <div className="bg-card rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">
        {template ? '编辑模板' : '创建模板'}
      </h2>

      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold mb-4">基本信息</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                模板名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : ''
                }`}
                placeholder="例如：Huawei 路由器标准巡检"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="模板的详细说明"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">分类</label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => updateField('category', value as TemplateCategory)}
                >
                  <SelectTrigger className="w-full" aria-label="模板分类">
                    <SelectValue placeholder="请选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">网络</SelectItem>
                    <SelectItem value="system">系统</SelectItem>
                    <SelectItem value="security">安全</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => updateField('isActive', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">启用此模板</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 设备类型配置 */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold mb-4">设备类型配置</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                支持厂商
              </label>
              <div className="flex flex-wrap gap-2">
                {vendorOptions.map((vendor) => (
                  <label
                    key={vendor}
                    className="flex items-center cursor-pointer px-3 py-2 border rounded hover:bg-muted/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.deviceTypes.includes(vendor)}
                      onChange={() => toggleDeviceType(vendor)}
                      className="mr-2"
                    />
                    <span className="text-sm">{vendor}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                设备类型 <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {deviceTypeOptions.map((type) => (
                  <label
                    key={type}
                    className="flex items-center cursor-pointer px-3 py-2 border rounded hover:bg-muted/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.deviceTypes.includes(type)}
                      onChange={() => toggleDeviceType(type)}
                      className="mr-2"
                    />
                    <span className="text-sm capitalize">{type}</span>
                  </label>
                ))}
              </div>
              {errors.deviceTypes && (
                <p className="text-red-500 text-sm mt-1">{errors.deviceTypes}</p>
              )}
            </div>
          </div>
        </div>

        {/* 检查项列表 */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              检查项列表
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({formData.checkItems.length} 项)
              </span>
            </h3>
            <button
              onClick={handleAddItem}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              + 添加检查项
            </button>
          </div>

          {errors.checkItems && (
            <p className="text-red-500 text-sm mb-2">{errors.checkItems}</p>
          )}

          {formData.checkItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border rounded">
              暂无检查项，点击上方按钮添加
            </div>
          ) : (
            <div className="space-y-2">
              {formData.checkItems.map((item, index) => (
                <div
                  key={item.id}
                  className="border rounded p-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{item.name}</h4>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          {item.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        权重: {item.weight}
                        {item.config.oid && ` | OID: ${item.config.oid}`}
                        {item.config.command && ` | 命令: ${item.config.command}`}
                      </div>
                    </div>

                    <div className="flex gap-1 ml-4">
                      <button
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="上移"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === formData.checkItems.length - 1}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="下移"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEditItem(item, index)}
                        className="p-1 hover:bg-blue-100 text-blue-600 rounded"
                        title="编辑"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteItem(index)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                        title="删除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-6 border-t">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-6 py-2 border rounded hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '保存中...' : '保存模板'}
          </button>
        </div>
      </div>
    </div>
  )
}
