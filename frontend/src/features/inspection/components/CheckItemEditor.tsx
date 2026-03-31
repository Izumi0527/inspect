/**
 * 检查项编辑器组件
 * 支持编辑检查项的所有字段，根据类型显示不同的配置选项
 */

import { useState } from 'react'
import type { InspectionCheckItem, CheckItemConfig, CheckItemType } from '../types'
import { isCheckItemTypeSupported } from '../utils/check-item-support'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CheckItemEditorProps {
  item?: InspectionCheckItem
  onSave: (item: InspectionCheckItem) => void
  onCancel: () => void
}

const OID_PATTERN = /^[0-9]+(\.[0-9]+)*$/

export function CheckItemEditor({ item, onSave, onCancel }: CheckItemEditorProps) {
  const [formData, setFormData] = useState<InspectionCheckItem>({
    id: item?.id || `item-${Date.now()}`,
    name: item?.name || '',
    type: item?.type || 'snmp',
    weight: item?.weight || 1,
    config: item?.config || {},
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const isSupportedType = isCheckItemTypeSupported(formData.type)

  // 验证表单
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = '检查项名称不能为空'
    }

    // SNMP：OID 非必填，但若填写则校验格式
    if (formData.type === 'snmp' && typeof formData.config.oid === 'string') {
      const oid = formData.config.oid.trim()
      if (oid && !OID_PATTERN.test(oid)) {
        newErrors.oid = 'OID 格式无效，应由数字和点组成，例如：1.3.6.1.2.1.1.3.0'
      }
    }

    // SSH：后端校验仍要求 command，避免保存历史模板失败
    if (formData.type === 'ssh' && !formData.config.command?.trim()) {
      newErrors.command = 'SSH 类型必须提供命令'
    }

    // 验证阈值
    if (formData.config.threshold) {
      const { warning, critical } = formData.config.threshold
      if (warning !== undefined && critical !== undefined && warning >= critical) {
        newErrors.threshold = '警告阈值必须小于严重阈值'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 处理保存
  const handleSave = () => {
    if (validateForm()) {
      onSave(formData)
    }
  }

  // 更新基本字段
  const updateField = <K extends keyof InspectionCheckItem>(field: K, value: InspectionCheckItem[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 更新配置字段
  const updateConfig = <K extends keyof CheckItemConfig>(field: K, value: CheckItemConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [field]: value },
    }))
  }

  // 更新阈值
  const updateThreshold = (type: 'warning' | 'critical', value: string) => {
    const numValue = value ? parseFloat(value) : undefined
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        threshold: {
          warning: type === 'warning' ? numValue : prev.config.threshold?.warning,
          critical: type === 'critical' ? numValue : prev.config.threshold?.critical,
        } as any,
      },
    }))
  }

  return (
    <div className="bg-card rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <h3 className="text-xl font-bold mb-6">
        {item ? '编辑检查项' : '新建检查项'}
      </h3>

      <div className="space-y-4">
        {/* 基本信息 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            检查项名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-500' : ''
            }`}
            placeholder="例如：CPU 使用率"
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              检查类型 <span className="text-red-500">*</span>
            </label>
            <Select
              value={formData.type}
              onValueChange={(value) => updateField('type', value as CheckItemType)}
            >
              <SelectTrigger className="w-full" aria-label="检查类型">
                <SelectValue placeholder="请选择检查类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="snmp">SNMP</SelectItem>
                <SelectItem value="ping">Ping</SelectItem>
                <SelectItem value="ssh" disabled={!isCheckItemTypeSupported('ssh')}>
                  SSH（暂不支持执行）
                </SelectItem>
                <SelectItem value="http" disabled={!isCheckItemTypeSupported('http')}>
                  HTTP（暂不支持执行）
                </SelectItem>
                <SelectItem value="script" disabled={!isCheckItemTypeSupported('script')}>
                  Script（暂不支持执行）
                </SelectItem>
              </SelectContent>
            </Select>
            {!isSupportedType && (
              <p className="text-amber-600 text-sm mt-1">
                当前版本执行引擎暂不支持该检查类型，执行时将被跳过；建议改为 Ping 或 SNMP。
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">权重</label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.weight}
              onChange={(e) => updateField('weight', parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 配置参数 - 根据类型显示不同字段 */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">配置参数</h4>

          {/* SNMP 配置 */}
          {formData.type === 'snmp' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  OID（可选）
                </label>
                <input
                  type="text"
                  value={formData.config.oid || ''}
                  onChange={(e) => updateConfig('oid', e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.oid ? 'border-red-500' : ''
                  }`}
                  placeholder="例如：1.3.6.1.2.1.1.3.0"
                />
                {errors.oid && <p className="text-red-500 text-sm mt-1">{errors.oid}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  未填写 OID 也可保存；当前版本主要支持 Ping/SNMP 的连通性与采集型检查。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">超时（毫秒）</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={formData.config.timeout || ''}
                  onChange={(e) =>
                    updateConfig('timeout', e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="默认 5000"
                />
              </div>
            </div>
          )}

          {/* SSH 配置 */}
          {formData.type === 'ssh' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  命令 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.config.command || ''}
                  onChange={(e) => updateConfig('command', e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.command ? 'border-red-500' : ''
                  }`}
                  placeholder="例如：show version"
                />
                {errors.command && (
                  <p className="text-red-500 text-sm mt-1">{errors.command}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">超时（毫秒）</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={formData.config.timeout || ''}
                  onChange={(e) =>
                    updateConfig('timeout', e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="默认 30000"
                />
              </div>
            </div>
          )}

          {/* HTTP 配置 */}
          {formData.type === 'http' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  URL（可选）
                </label>
                <input
                  type="text"
                  value={formData.config.url || ''}
                  onChange={(e) => updateConfig('url', e.target.value)}
                  className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.url ? 'border-red-500' : ''
                  }`}
                  placeholder="例如：http://device/api/status"
                />
                {errors.url && <p className="text-red-500 text-sm mt-1">{errors.url}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">超时（毫秒）</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={formData.config.timeout || ''}
                  onChange={(e) =>
                    updateConfig('timeout', e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="默认 10000"
                />
              </div>
            </div>
          )}

          {/* 阈值配置 - 适用于所有类型 */}
          <div className="mt-4 pt-4 border-t">
            <h5 className="text-sm font-medium mb-2">阈值配置（可选）</h5>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">警告阈值</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.config.threshold?.warning ?? ''}
                  onChange={(e) => updateThreshold('warning', e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：80"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">严重阈值</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.config.threshold?.critical ?? ''}
                  onChange={(e) => updateThreshold('critical', e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：90"
                />
              </div>
            </div>
            {errors.threshold && (
              <p className="text-red-500 text-sm mt-1">{errors.threshold}</p>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
