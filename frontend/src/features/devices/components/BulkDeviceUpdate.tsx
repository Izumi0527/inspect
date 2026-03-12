import React, { useMemo, useState } from 'react'
import { Save, AlertCircle } from 'lucide-react'
import {
  SimpleModal,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Loading
} from '@/components/atoms'
import { Device } from '../types'

interface BulkDeviceUpdateProps {
  isOpen: boolean
  onClose: () => void
  selectedDevices: Device[]
  onBulkUpdate: (updates: Partial<Device>) => Promise<void>
  isProcessing: boolean
}

type UpdatableDeviceField = 'device_type' | 'status' | 'location'
type FieldValue = Device[UpdatableDeviceField]

interface UpdateField {
  key: UpdatableDeviceField
  label: string
  type: 'text' | 'select' | 'textarea'
  options?: Array<{ value: string; label: string }>
  description?: string
}

export const BulkDeviceUpdate: React.FC<BulkDeviceUpdateProps> = ({
  isOpen,
  onClose,
  selectedDevices,
  onBulkUpdate,
  isProcessing
}) => {
  const [selectedFields, setSelectedFields] = useState<Set<UpdatableDeviceField>>(new Set())
  const [updateValues, setUpdateValues] = useState<Partial<Record<UpdatableDeviceField, FieldValue>>>({})
  const [submitError, setSubmitError] = useState<string>('')

  const updateFields: UpdateField[] = [
    {
      key: 'device_type',
      label: '设备类型',
      type: 'select',
      options: [
        { value: 'switch', label: '交换机' },
        { value: 'router', label: '路由器' },
        { value: 'firewall', label: '防火墙' },
        { value: 'wireless_ap', label: '无线AP' }
      ],
      description: '更改设备的类型分类'
    },
    {
      key: 'status',
      label: '设备状态',
      type: 'select',
      options: [
        { value: 'online', label: '在线' },
        { value: 'offline', label: '离线' },
        { value: 'warning', label: '告警' },
        { value: 'maintenance', label: '维护' }
      ],
      description: '手动设置设备状态'
    },
    {
      key: 'location',
      label: '设备位置',
      type: 'text',
      description: '批量更新设备的物理位置'
    }
  ]

  const handleFieldToggle = (fieldKey: UpdatableDeviceField) => {
    const newSelectedFields = new Set(selectedFields)
    if (newSelectedFields.has(fieldKey)) {
      newSelectedFields.delete(fieldKey)
      const newValues = { ...updateValues }
      delete newValues[fieldKey]
      setUpdateValues(newValues)
    } else {
      newSelectedFields.add(fieldKey)
    }
    setSelectedFields(newSelectedFields)
    setSubmitError('')
  }

  const handleValueChange = (fieldKey: UpdatableDeviceField, value: FieldValue) => {
    setUpdateValues(prev => ({
      ...prev,
      [fieldKey]: value
    }))
    setSubmitError('')
  }

  const effectiveUpdates = useMemo(() => {
    const updates: Partial<Device> = {}
    selectedFields.forEach(field => {
      const value = updateValues[field]
      if (value !== undefined && value !== '') {
        ;(updates as Record<UpdatableDeviceField, FieldValue>)[field] = value
      }
    })
    return updates
  }, [selectedFields, updateValues])

  const canSubmit =
    selectedFields.size > 0 &&
    Object.keys(effectiveUpdates).length > 0 &&
    !isProcessing

  const handleSubmit = async () => {
    if (selectedFields.size === 0) return

    if (Object.keys(effectiveUpdates).length === 0) {
      setSubmitError('请选择字段后，请至少填写一个字段的新值再提交。')
      return
    }

    setSubmitError('')
    await onBulkUpdate(effectiveUpdates)
  }

  const renderFieldInput = (field: UpdateField) => {
    if (!selectedFields.has(field.key)) return null

    switch (field.type) {
      case 'select':
        return (
          <Select
            value={String(updateValues[field.key] ?? '')}
            onValueChange={(value) => handleValueChange(field.key, value as FieldValue)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`选择${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      
      case 'textarea':
        return (
          <textarea
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={3}
            placeholder={`输入${field.label}`}
            value={String(updateValues[field.key] ?? '')}
            onChange={(e) => handleValueChange(field.key, e.target.value as FieldValue)}
          />
        )
      
      default:
        return (
          <Input
            type="text"
            placeholder={`输入${field.label}`}
            value={String(updateValues[field.key] ?? '')}
            onChange={(e) => handleValueChange(field.key, e.target.value as FieldValue)}
          />
        )
    }
  }

  return (
    <SimpleModal
      open={isOpen}
      onClose={onClose}
      title="批量更新设备"
      size="4xl"
    >
      <div className="p-1">
        <p className="text-sm text-muted-foreground mb-6">
          将更新 {selectedDevices.length} 个设备的属性
        </p>

        {/* 选中设备概览 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">选中的设备</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-32 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {selectedDevices.slice(0, 10).map((device) => (
                  <Badge key={device.id} variant="outline" className="text-xs">
                    {device.name}
                  </Badge>
                ))}
                {selectedDevices.length > 10 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedDevices.length - 10} 更多
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 更新字段选择 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">选择要更新的字段</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {updateFields.map((field) => (
                <div key={String(field.key)} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`field-${String(field.key)}`}
                      checked={selectedFields.has(field.key)}
                      onChange={() => handleFieldToggle(field.key)}
                      className="w-4 h-4 text-blue-600 border-border rounded focus:ring-blue-500"
                    />
                    <label 
                      htmlFor={`field-${String(field.key)}`}
                      className="font-medium text-foreground cursor-pointer"
                    >
                      {field.label}
                    </label>
                  </div>
                  
                  {field.description && (
                    <p className="text-sm text-muted-foreground ml-7">
                      {field.description}
                    </p>
                  )}
                  
                  {selectedFields.has(field.key) && (
                    <div className="ml-7">
                      {renderFieldInput(field)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 更新预览 */}
        {selectedFields.size > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                更新预览
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 mb-2">
                  将对 {selectedDevices.length} 个设备执行以下更新：
                </p>
                {Object.keys(effectiveUpdates).length === 0 ? (
                  <p className="text-sm text-blue-700">
                    请选择要更新的字段，并填写新值后再提交。
                  </p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(effectiveUpdates).map(([fieldKey, value]) => {
                      const fieldConfig = updateFields.find(f => String(f.key) === fieldKey)
                      if (!fieldConfig) return null
                      return (
                        <div key={fieldKey} className="text-sm text-blue-700">
                          • {fieldConfig.label}: {String(value)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 底部按钮 */}
        {submitError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              selectedFields.size === 0
                ? '请选择要更新的字段'
                : Object.keys(effectiveUpdates).length === 0
                  ? '请填写至少一个字段的新值'
                  : undefined
            }
            className="min-w-[100px]"
          >
            {isProcessing ? (
              <Loading size="sm" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                批量更新
              </>
            )}
          </Button>
        </div>
      </div>
    </SimpleModal>
  )
}
