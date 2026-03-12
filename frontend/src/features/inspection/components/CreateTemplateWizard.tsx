/**
 * 创建模板向导组件
 * 采用分步向导式设计，提供更好的用户体验
 */

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  Monitor,
  Settings,
  Shield,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  Info,
  Zap,
  Eye,
  Save
} from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
import { useCreateTemplate, useUpdateTemplate } from '../hooks/useInspection'
import type { InspectionTemplate, InspectionCheckItem, CheckItemType, TemplateCategory } from '../types'

// ============================================================================
// 类型定义
// ============================================================================

interface Props {
  template?: InspectionTemplate | null
  onClose: () => void
  onSuccess: () => void
}

interface TemplateFormData {
  name: string
  description: string
  category: TemplateCategory
  deviceTypes: string[]
  checkItems: InspectionCheckItem[]
  isActive: boolean
}

interface StepProps {
  formData: TemplateFormData
  errors: Record<string, string>
  onChange: <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => void
  onValidate?: () => boolean
}

// ============================================================================
// 常量配置
// ============================================================================

const STEPS = [
  { id: 1, title: '基本信息', icon: FileText, description: '设置模板名称和分类' },
  { id: 2, title: '设备类型', icon: Monitor, description: '选择支持的设备类型' },
  { id: 3, title: '检查项', icon: Settings, description: '配置巡检检查项' },
  { id: 4, title: '预览确认', icon: Eye, description: '确认模板配置' }
]

const CATEGORY_OPTIONS = [
  { value: 'network', label: '网络监控', icon: Monitor, color: 'blue', description: '网络设备状态、流量、连通性检查' },
  { value: 'system', label: '系统检查', icon: Settings, color: 'green', description: 'CPU、内存、磁盘等系统资源检查' },
  { value: 'security', label: '安全检测', icon: Shield, color: 'red', description: '安全策略、漏洞、配置合规检查' },
  { value: 'custom', label: '自定义', icon: FileText, color: 'purple', description: '自定义检查项组合' }
] as const

// Tailwind 动态拼接 class 在生产构建可能被裁剪，这里用静态映射确保样式稳定
const CATEGORY_COLOR_CLASS = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text600: 'text-blue-600' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text600: 'text-green-600' },
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text600: 'text-red-600' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text600: 'text-purple-600' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-900/30', text600: 'text-gray-600' }
} as const

type CategoryColor = keyof typeof CATEGORY_COLOR_CLASS

const getCategoryColorClass = (color?: string) => {
  if (!color) return CATEGORY_COLOR_CLASS.gray
  return CATEGORY_COLOR_CLASS[color as CategoryColor] ?? CATEGORY_COLOR_CLASS.gray
}

const DEVICE_TYPE_OPTIONS = [
  { value: 'router', label: '路由器', icon: '🌐' },
  { value: 'switch', label: '交换机', icon: '🔀' },
  { value: 'firewall', label: '防火墙', icon: '🛡️' },
  { value: 'server', label: '服务器', icon: '🖥️' },
  { value: 'storage', label: '存储设备', icon: '💾' },
  { value: 'wireless', label: '无线设备', icon: '📡' }
]

const CHECK_TYPE_OPTIONS: { value: CheckItemType; label: string; description: string; icon: string }[] = [
  { value: 'snmp', label: 'SNMP', description: '通过 SNMP 协议获取设备信息', icon: '📊' },
  { value: 'ssh', label: 'SSH', description: '通过 SSH 执行命令获取信息', icon: '💻' },
  { value: 'http', label: 'HTTP', description: '通过 HTTP 接口获取信息', icon: '🌍' },
  { value: 'ping', label: 'Ping', description: '检测设备连通性', icon: '📶' },
  { value: 'script', label: 'Script', description: '执行自定义脚本', icon: '📜' }
]

// 预设检查项模板
const PRESET_CHECK_ITEMS: Record<string, InspectionCheckItem[]> = {
  network: [
    { id: 'cpu', name: 'CPU 使用率', type: 'snmp', weight: 3, config: { oid: '1.3.6.1.4.1.9.9.109.1.1.1.1.3.1', threshold: { warning: 70, critical: 90 } } },
    { id: 'memory', name: '内存使用率', type: 'snmp', weight: 3, config: { oid: '1.3.6.1.4.1.9.9.48.1.1.1.6.1', threshold: { warning: 80, critical: 95 } } },
    { id: 'uptime', name: '系统运行时间', type: 'snmp', weight: 1, config: { oid: '1.3.6.1.2.1.1.3.0' } },
    { id: 'interfaces', name: '接口状态', type: 'snmp', weight: 2, config: { oid: '1.3.6.1.2.1.2.2.1.8' } }
  ],
  system: [
    { id: 'cpu', name: 'CPU 负载', type: 'ssh', weight: 3, config: { command: 'top -bn1 | grep "Cpu(s)"', threshold: { warning: 70, critical: 90 } } },
    { id: 'memory', name: '内存使用', type: 'ssh', weight: 3, config: { command: 'free -m', threshold: { warning: 80, critical: 95 } } },
    { id: 'disk', name: '磁盘使用', type: 'ssh', weight: 2, config: { command: 'df -h', threshold: { warning: 80, critical: 90 } } }
  ],
  security: [
    { id: 'firewall', name: '防火墙状态', type: 'ssh', weight: 3, config: { command: 'show firewall status' } },
    { id: 'acl', name: 'ACL 配置', type: 'ssh', weight: 2, config: { command: 'show access-lists' } },
    { id: 'login', name: '登录尝试', type: 'ssh', weight: 2, config: { command: 'show login failures' } }
  ]
}

// ============================================================================
// 工具函数
// ============================================================================

const createInitialFormState = (): TemplateFormData => ({
  name: '',
  description: '',
  category: 'custom',
  deviceTypes: [],
  checkItems: [],
  isActive: true
})

const generateCheckItemId = () => `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// ============================================================================
// Step 1: 基本信息
// ============================================================================

const StepBasicInfo: React.FC<StepProps> = ({ formData, errors, onChange }) => {
  return (
    <div className="space-y-6">
      {/* 模板名称 */}
      <div>
        <label className="block text-sm font-medium text-foreground/90 mb-2">
          模板名称 <span className="text-red-500">*</span>
        </label>
        <Input
          value={formData.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="例如：Cisco 路由器标准巡检模板"
          className={errors.name ? 'border-red-500' : ''}
          maxLength={100}
        />
        <div className="flex justify-between mt-1">
          {errors.name && (
            <p className="text-sm text-red-500">{errors.name}</p>
          )}
          <span className={`text-xs ml-auto ${formData.name.length > 80 ? 'text-orange-500' : 'text-gray-400'}`}>
            {formData.name.length}/100
          </span>
        </div>
      </div>

      {/* 模板描述 */}
      <div>
        <label className="block text-sm font-medium text-foreground/90 mb-2">
          模板描述
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="描述此模板的用途、适用场景等信息..."
          className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 resize-none"
          rows={3}
          maxLength={500}
        />
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${formData.description.length > 400 ? 'text-orange-500' : 'text-gray-400'}`}>
            {formData.description.length}/500
          </span>
        </div>
      </div>

      {/* 模板分类 */}
      <div>
        <label className="block text-sm font-medium text-foreground/90 mb-3">
          模板分类 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = formData.category === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('category', option.value as TemplateCategory)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-border hover:border-border dark:hover:border-gray-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    isSelected ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                  </div>
                  <div className="font-medium text-foreground">{option.label}</div>
                  {isSelected && (
                    <Check className="w-5 h-5 text-blue-600 ml-auto" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Step 2: 设备类型
// ============================================================================

const StepDeviceTypes: React.FC<StepProps> = ({ formData, errors, onChange }) => {
  const [customType, setCustomType] = useState('')

  const toggleDeviceType = (type: string) => {
    const newTypes = formData.deviceTypes.includes(type)
      ? formData.deviceTypes.filter(t => t !== type)
      : [...formData.deviceTypes, type]
    onChange('deviceTypes', newTypes)
  }

  const addCustomType = () => {
    const trimmed = customType.trim().toLowerCase()
    if (trimmed && !formData.deviceTypes.includes(trimmed)) {
      onChange('deviceTypes', [...formData.deviceTypes, trimmed])
      setCustomType('')
    }
  }

  return (
    <div className="space-y-6">
      {/* 预设设备类型 */}
      <div>
        <label className="block text-sm font-medium text-foreground/90 mb-3">
          常用设备类型
        </label>
        <div className="grid grid-cols-3 gap-3">
          {DEVICE_TYPE_OPTIONS.map((option) => {
            const isSelected = formData.deviceTypes.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleDeviceType(option.value)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-border hover:border-border'
                }`}
              >
                <div className="text-2xl mb-2">{option.icon}</div>
                <div className={`font-medium ${isSelected ? 'text-blue-600' : 'text-foreground/90'}`}>
                  {option.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 自定义设备类型 */}
      <div>
        <label className="block text-sm font-medium text-foreground/90 mb-2">
          添加自定义设备类型
        </label>
        <div className="flex gap-2">
          <Input
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="输入自定义设备类型"
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomType())}
          />
          <Button type="button" variant="outline" onClick={addCustomType}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 已选设备类型 */}
      {formData.deviceTypes.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground/90 mb-2">
            已选择 ({formData.deviceTypes.length})
          </label>
          <div className="flex flex-wrap gap-2 p-4 bg-muted/40 rounded-lg">
            {formData.deviceTypes.map((type) => (
              <Badge key={type} variant="secondary" className="flex items-center gap-1 px-3 py-1.5">
                {type}
                <button
                  type="button"
                  onClick={() => toggleDeviceType(type)}
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
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{errors.deviceTypes}</p>
        </div>
      )}
    </div>
  )
}

export default StepBasicInfo


// ============================================================================
// Step 3: 检查项配置
// ============================================================================

interface CheckItemEditorInlineProps {
  item: InspectionCheckItem
  onUpdate: (updates: Partial<InspectionCheckItem>) => void
  onDelete: () => void
  isExpanded: boolean
  onToggleExpand: () => void
}

const CheckItemEditorInline: React.FC<CheckItemEditorInlineProps> = ({
  item,
  onUpdate,
  onDelete,
  isExpanded,
  onToggleExpand
}) => {
  const typeOption = CHECK_TYPE_OPTIONS.find(t => t.value === item.type)

  const updateConfig = (key: string, value: any) => {
    onUpdate({
      config: { ...item.config, [key]: value }
    })
  }

  const updateThreshold = (type: 'warning' | 'critical', value: string) => {
    const numValue = value ? parseFloat(value) : undefined
    onUpdate({
      config: {
        ...item.config,
        threshold: {
          ...item.config.threshold,
          [type]: numValue
        }
      }
    })
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* 折叠头部 */}
      <div
        className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
          isExpanded ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-card hover:bg-muted/40 dark:hover:bg-gray-700'
        }`}
        onClick={onToggleExpand}
      >
        <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{typeOption?.icon}</span>
            <span className="font-medium text-foreground">{item.name || '未命名检查项'}</span>
            <Badge variant="outline" size="sm">{typeOption?.label || item.type}</Badge>
            <Badge variant="secondary" size="sm">权重: {item.weight}</Badge>
          </div>
          {item.config.oid && (
            <p className="text-xs text-gray-500 mt-1">OID: {item.config.oid}</p>
          )}
          {item.config.command && (
            <p className="text-xs text-gray-500 mt-1">命令: {item.config.command}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
          <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* 展开内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-border bg-muted/40 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    检查项名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={item.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    placeholder="例如：CPU 使用率"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    权重 (1-10)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={item.weight}
                    onChange={(e) => onUpdate({ weight: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              {/* 检查类型 */}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-2">
                  检查类型
                </label>
                <div className="flex flex-wrap gap-2">
                  {CHECK_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onUpdate({ type: option.value, config: {} })}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        item.type === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700'
                          : 'border-border hover:border-border'
                      }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 类型特定配置 */}
              {item.type === 'snmp' && (
                <div className="space-y-3 p-4 bg-card rounded-lg">
                  <h5 className="font-medium text-foreground flex items-center gap-2">
                    <span>📊</span> SNMP 配置
                  </h5>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      OID <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.config.oid || ''}
                      onChange={(e) => updateConfig('oid', e.target.value)}
                      placeholder="例如：1.3.6.1.2.1.1.3.0"
                    />
                    <p className="text-xs text-gray-500 mt-1">输入要查询的 SNMP OID</p>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      超时时间 (毫秒)
                    </label>
                    <Input
                      type="number"
                      value={item.config.timeout || ''}
                      onChange={(e) => updateConfig('timeout', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="默认 5000"
                    />
                  </div>
                </div>
              )}

              {item.type === 'ssh' && (
                <div className="space-y-3 p-4 bg-card rounded-lg">
                  <h5 className="font-medium text-foreground flex items-center gap-2">
                    <span>💻</span> SSH 配置
                  </h5>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      执行命令 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.config.command || ''}
                      onChange={(e) => updateConfig('command', e.target.value)}
                      placeholder="例如：show version"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      超时时间 (毫秒)
                    </label>
                    <Input
                      type="number"
                      value={item.config.timeout || ''}
                      onChange={(e) => updateConfig('timeout', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="默认 30000"
                    />
                  </div>
                </div>
              )}

              {item.type === 'http' && (
                <div className="space-y-3 p-4 bg-card rounded-lg">
                  <h5 className="font-medium text-foreground flex items-center gap-2">
                    <span>🌍</span> HTTP 配置
                  </h5>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      请求 URL <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.config.url || ''}
                      onChange={(e) => updateConfig('url', e.target.value)}
                      placeholder="例如：http://device/api/status"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      期望值
                    </label>
                    <Input
                      value={item.config.expectedValue || ''}
                      onChange={(e) => updateConfig('expectedValue', e.target.value)}
                      placeholder="用于结果比对的期望值"
                    />
                  </div>
                </div>
              )}

              {item.type === 'script' && (
                <div className="space-y-3 p-4 bg-card rounded-lg">
                  <h5 className="font-medium text-foreground flex items-center gap-2">
                    <span>📜</span> 脚本配置
                  </h5>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      脚本内容
                    </label>
                    <textarea
                      value={item.config.script || ''}
                      onChange={(e) => updateConfig('script', e.target.value)}
                      placeholder="输入自定义脚本..."
                      className="w-full px-3 py-2 border rounded-lg font-mono text-sm dark:bg-gray-800 dark:border-gray-600"
                      rows={4}
                    />
                  </div>
                </div>
              )}

              {/* 阈值配置 */}
              <div className="p-4 bg-card rounded-lg">
                <h5 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <span>⚡</span> 阈值配置 (可选)
                </h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      警告阈值
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.config.threshold?.warning ?? ''}
                      onChange={(e) => updateThreshold('warning', e.target.value)}
                      placeholder="例如：70"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">
                      严重阈值
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.config.threshold?.critical ?? ''}
                      onChange={(e) => updateThreshold('critical', e.target.value)}
                      placeholder="例如：90"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  <Info className="w-3 h-3 inline mr-1" />
                  警告阈值应小于严重阈值
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const StepCheckItems: React.FC<StepProps> = ({ formData, errors, onChange }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const addCheckItem = () => {
    const newItem: InspectionCheckItem = {
      id: generateCheckItemId(),
      name: '',
      type: 'snmp',
      weight: 1,
      config: {}
    }
    onChange('checkItems', [...formData.checkItems, newItem])
    setExpandedId(newItem.id)
  }

  const updateCheckItem = (id: string, updates: Partial<InspectionCheckItem>) => {
    onChange('checkItems', formData.checkItems.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }

  const deleteCheckItem = (id: string) => {
    onChange('checkItems', formData.checkItems.filter(item => item.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const applyPreset = (category: string) => {
    const presetItems = PRESET_CHECK_ITEMS[category]
    if (presetItems) {
      const newItems = presetItems.map(item => ({
        ...item,
        id: generateCheckItemId()
      }))
      onChange('checkItems', [...formData.checkItems, ...newItems])
    }
  }

  return (
    <div className="space-y-6">
      {/* 快速添加预设 */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-foreground">快速添加预设检查项</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset('network')}
          >
            <Monitor className="w-4 h-4 mr-1" />
            网络设备检查项
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset('system')}
          >
            <Settings className="w-4 h-4 mr-1" />
            系统检查项
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset('security')}
          >
            <Shield className="w-4 h-4 mr-1" />
            安全检查项
          </Button>
        </div>
      </div>

      {/* 检查项列表 */}
      <div className="space-y-3">
        {formData.checkItems.length > 0 ? (
          formData.checkItems.map((item) => (
            <CheckItemEditorInline
              key={item.id}
              item={item}
              onUpdate={(updates) => updateCheckItem(item.id, updates)}
              onDelete={() => deleteCheckItem(item.id)}
              isExpanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))
        ) : (
          <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              暂无检查项，点击下方按钮添加或使用预设
            </p>
          </div>
        )}
      </div>

      {/* 添加按钮 */}
      <Button
        type="button"
        variant="outline"
        className="w-full py-3"
        onClick={addCheckItem}
      >
        <Plus className="w-4 h-4 mr-2" />
        添加检查项
      </Button>

      {errors.checkItems && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{errors.checkItems}</p>
        </div>
      )}
    </div>
  )
}


// ============================================================================
// Step 4: 预览确认
// ============================================================================

const StepPreview: React.FC<StepProps> = ({ formData }) => {
  const categoryOption = CATEGORY_OPTIONS.find(c => c.value === formData.category)
  const CategoryIcon = categoryOption?.icon || FileText
  const categoryColorClass = getCategoryColorClass(categoryOption?.color)

  return (
    <div className="space-y-6">
      {/* 基本信息预览 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${categoryColorClass.bg}`}>
              <CategoryIcon className={`w-8 h-8 ${categoryColorClass.text600}`} />
            </div>
            <div className="flex-1">
              <h4 className="text-xl font-semibold text-foreground">
                {formData.name || '未命名模板'}
              </h4>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="primary">{categoryOption?.label || '自定义'}</Badge>
                {formData.isActive ? (
                  <Badge variant="success">已启用</Badge>
                ) : (
                  <Badge variant="outline">已禁用</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 设备类型预览 */}
      <Card>
        <CardContent className="p-6">
          <h5 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-purple-600" />
            支持设备类型 ({formData.deviceTypes.length})
          </h5>
          <div className="flex flex-wrap gap-2">
            {formData.deviceTypes.map((type) => {
              const option = DEVICE_TYPE_OPTIONS.find(o => o.value === type)
              return (
                <Badge key={type} variant="secondary" className="px-3 py-1.5">
                  {option?.icon && <span className="mr-1">{option.icon}</span>}
                  {option?.label || type}
                </Badge>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 检查项预览 */}
      <Card>
        <CardContent className="p-6">
          <h5 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Settings className="w-5 h-5 text-green-600" />
            检查项配置 ({formData.checkItems.length} 项)
          </h5>
          <div className="space-y-2">
            {formData.checkItems.map((item, index) => {
              const typeOption = CHECK_TYPE_OPTIONS.find(t => t.value === item.type)
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg"
                >
                  <span className="text-gray-400 font-mono text-sm w-6">{index + 1}.</span>
                  <span className="text-lg">{typeOption?.icon}</span>
                  <div className="flex-1">
                    <span className="font-medium text-foreground">
                      {item.name || '未命名'}
                    </span>
                    <span className="text-gray-500 text-sm ml-2">
                      ({typeOption?.label || item.type})
                    </span>
                  </div>
                  <Badge variant="outline" size="sm">权重: {item.weight}</Badge>
                  {item.config.threshold && (
                    <Badge variant="warning" size="sm">
                      阈值: {item.config.threshold.warning}/{item.config.threshold.critical}
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export const CreateTemplateWizard: React.FC<Props> = ({ template, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<TemplateFormData>(() => {
    if (template) {
      return {
        name: template.name,
        description: template.description,
        category: template.category,
        deviceTypes: [...template.deviceTypes],
        checkItems: [...template.checkItems],
        isActive: template.isActive ?? true
      }
    }
    return createInitialFormState()
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const isEditing = !!template
  const isLoading = createTemplate.isPending || updateTemplate.isPending

  // 更新表单字段
  const handleChange = useCallback(<K extends keyof TemplateFormData>(
    field: K,
    value: TemplateFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }, [errors])

  // 验证当前步骤
  const validateStep = useCallback((step: number): boolean => {
    const newErrors: Record<string, string> = {}

    switch (step) {
      case 1:
        if (!formData.name.trim()) {
          newErrors.name = '请输入模板名称'
        } else if (formData.name.length > 100) {
          newErrors.name = '模板名称不能超过100个字符'
        }
        break
      case 2:
        if (formData.deviceTypes.length === 0) {
          newErrors.deviceTypes = '请至少选择一种设备类型'
        }
        break
      case 3:
        if (formData.checkItems.length === 0) {
          newErrors.checkItems = '请至少添加一个检查项'
        } else {
          // 验证每个检查项
          for (const item of formData.checkItems) {
            if (!item.name.trim()) {
              newErrors.checkItems = '所有检查项都必须有名称'
              break
            }
            if (item.type === 'snmp' && !item.config.oid) {
              newErrors.checkItems = 'SNMP 类型的检查项必须配置 OID'
              break
            }
            if (item.type === 'ssh' && !item.config.command) {
              newErrors.checkItems = 'SSH 类型的检查项必须配置命令'
              break
            }
            if (item.type === 'http' && !item.config.url) {
              newErrors.checkItems = 'HTTP 类型的检查项必须配置 URL'
              break
            }
            if (item.config.threshold) {
              const { warning, critical } = item.config.threshold
              if (warning !== undefined && critical !== undefined && warning >= critical) {
                newErrors.checkItems = '警告阈值必须小于严重阈值'
                break
              }
            }
          }
        }
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  // 下一步
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length))
    }
  }

  // 上一步
  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  // 提交表单
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

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

  // 渲染当前步骤内容
  const renderStepContent = () => {
    const stepProps: StepProps = {
      formData,
      errors,
      onChange: handleChange
    }

    switch (currentStep) {
      case 1:
        return <StepBasicInfo {...stepProps} />
      case 2:
        return <StepDeviceTypes {...stepProps} />
      case 3:
        return <StepCheckItems {...stepProps} />
      case 4:
        return <StepPreview {...stepProps} />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {isEditing ? '编辑巡检模板' : '创建巡检模板'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {STEPS[currentStep - 1].description}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 步骤指示器 */}
        <div className="px-6 py-4 bg-muted/40">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id
              const Icon = step.icon

              return (
                <React.Fragment key={step.id}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="hidden sm:block">
                      <div className={`font-medium ${isActive ? 'text-blue-600' : 'text-foreground/90'}`}>
                        {step.title}
                      </div>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                    }`} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t dark:border-gray-700 bg-muted/40">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handlePrev} disabled={isLoading}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一步
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              取消
            </Button>
            {currentStep < STEPS.length ? (
              <Button onClick={handleNext}>
                下一步
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isEditing ? '保存修改' : '创建模板'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

