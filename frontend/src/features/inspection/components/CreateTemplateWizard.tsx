/**
 * 创建模板向导组件
 * 采用分步向导式设计，统一接入 SimpleModal 与三皮肤语义令牌
 */

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
  Save,
} from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge,
  Card,
  CardContent,
} from '@/components/atoms'
import { TextArea } from '@/components/atoms/input'
import { SimpleModal } from '@/components/atoms/modal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils/cn'
import {
  INSPECTABLE_DEVICE_TYPE_OPTIONS,
  getDeviceTypeLabel,
  isInspectableDeviceType,
} from '@/utils/deviceTypes'
import {
  useCreateTemplate,
  useUpdateTemplate,
  useInspectionTemplates,
} from '../hooks/useInspection'
import { isCheckItemTypeSupported } from '../utils/check-item-support'
import { getCategoryMeta, getCheckTypeMeta } from '../utils/templatePresentation'
import type {
  InspectionTemplate,
  InspectionCheckItem,
  CheckItemType,
  TemplateCategory,
} from '../types'

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
  onChange: <K extends keyof TemplateFormData>(
    field: K,
    value: TemplateFormData[K]
  ) => void
  onValidate?: () => boolean
  legacyDeviceTypes?: string[]
}

const STEPS = [
  { id: 1, title: '基本信息', icon: FileText, description: '设置模板名称和分类' },
  { id: 2, title: '设备类型', icon: Monitor, description: '选择模板适用的设备类型' },
  { id: 3, title: '检查项', icon: Settings, description: '配置巡检检查项' },
  { id: 4, title: '预览确认', icon: Eye, description: '确认模板配置' },
]

const CATEGORY_OPTIONS = [
  {
    value: 'network',
    label: '网络监控',
    icon: Monitor,
    chipClass: 'bg-info-soft text-info-soft-foreground',
    description: '网络设备状态、流量、连通性检查',
  },
  {
    value: 'system',
    label: '系统检查',
    icon: Settings,
    chipClass: 'bg-surface-2 text-foreground',
    description: 'CPU、内存、磁盘等系统资源检查',
  },
  {
    value: 'security',
    label: '安全检测',
    icon: Shield,
    chipClass: 'bg-warning-soft text-warning-soft-foreground',
    description: '安全策略、漏洞、配置合规检查',
  },
  {
    value: 'custom',
    label: '自定义',
    icon: FileText,
    chipClass: 'bg-primary/10 text-primary',
    description: '自定义检查项组合',
  },
] as const

// 四类可巡检设备的图标；取值与中文名来自 utils/deviceTypes（单选文案契约）
const DEVICE_TYPE_ICONS: Record<string, string> = {
  switch: '🔀',
  router: '🌐',
  firewall: '🛡️',
  server: '🖥️',
}

const CHECK_TYPE_OPTIONS: {
  value: CheckItemType
  label: string
  description: string
  supported: boolean
}[] = [
  {
    value: 'snmp',
    label: 'SNMP',
    description: '通过 SNMP 协议获取设备信息',
    supported: isCheckItemTypeSupported('snmp'),
  },
  {
    value: 'ping',
    label: 'Ping',
    description: '检测设备连通性',
    supported: isCheckItemTypeSupported('ping'),
  },
  {
    value: 'ssh',
    label: 'SSH',
    description: '通过 SSH 执行命令获取信息（当前版本不执行）',
    supported: isCheckItemTypeSupported('ssh'),
  },
  {
    value: 'http',
    label: 'HTTP',
    description: '通过 HTTP 接口获取信息（当前版本不执行）',
    supported: isCheckItemTypeSupported('http'),
  },
  {
    value: 'script',
    label: 'Script',
    description: '执行自定义脚本（当前版本不执行）',
    supported: isCheckItemTypeSupported('script'),
  },
]

const OID_PATTERN = /^[0-9]+(\.[0-9]+)*$/

/** 判断指标是否属于数值越低越危险的下限型指标（警告阈值必须大于严重阈值） */
export const isLowerBoundedMetric = (metric?: string): boolean => {
  const normalized = (metric ?? '').trim().toLowerCase()
  return normalized === 'poe' || normalized === 'optical_power' || normalized === 'stp_status'
}

interface MetricOption {
  metric: string
  label: string
}

const checkItemKey = (item: InspectionCheckItem): string =>
  item.type === 'ping' ? 'connectivity' : (item.metric ?? '').trim().toLowerCase()

const buildMetricOptions = (
  templates: InspectionTemplate[],
  deviceType?: string
): MetricOption[] => {
  const ordered = [
    ...templates.filter((t) => deviceType && t.deviceTypes.includes(deviceType)),
    ...templates.filter((t) => !deviceType || !t.deviceTypes.includes(deviceType)),
  ]
  const seen = new Set<string>()
  const options: MetricOption[] = []
  for (const template of ordered) {
    for (const item of template.checkItems) {
      const metric = item.type === 'snmp' ? (item.metric ?? '').trim() : ''
      if (!metric || seen.has(metric)) continue
      seen.add(metric)
      options.push({ metric, label: item.name })
    }
  }
  return options
}

const initialDeviceTypes = (deviceTypes: string[]): string[] =>
  deviceTypes.length === 1 && isInspectableDeviceType(deviceTypes[0])
    ? [deviceTypes[0].trim().toLowerCase()]
    : []

const createInitialFormState = (): TemplateFormData => ({
  name: '',
  description: '',
  category: 'custom',
  deviceTypes: [],
  checkItems: [],
  isActive: true,
})

const generateCheckItemId = () =>
  `item-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

// ============================================================================
// Step 1: 基本信息
// ============================================================================

const StepBasicInfo: React.FC<StepProps> = ({ formData, errors, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="wizard-template-name"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          模板名称 <span className="text-danger">*</span>
        </label>
        <Input
          id="wizard-template-name"
          value={formData.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="例如：Huawei 路由器标准巡检模板"
          className={errors.name ? 'border-danger' : ''}
          maxLength={100}
        />
        <div className="flex justify-between mt-1">
          {errors.name && <p className="text-xs text-danger">{errors.name}</p>}
          <span
            className={cn(
              'text-xs ml-auto tabular-nums',
              formData.name.length > 80 ? 'text-warning' : 'text-muted-foreground'
            )}
          >
            {formData.name.length}/100
          </span>
        </div>
      </div>

      <div>
        <label
          htmlFor="wizard-template-desc"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          模板描述
        </label>
        <TextArea
          id="wizard-template-desc"
          value={formData.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="描述此模板的用途、适用场景等信息..."
          className="min-h-[84px] px-3 py-2"
          rows={3}
          maxLength={500}
        />
        <div className="flex justify-end mt-1">
          <span
            className={cn(
              'text-xs tabular-nums',
              formData.description.length > 400
                ? 'text-warning'
                : 'text-muted-foreground'
            )}
          >
            {formData.description.length}/500
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2.5">
          模板分类 <span className="text-danger">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = formData.category === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('category', option.value as TemplateCategory)}
                className={cn(
                  'p-3.5 rounded-lg border text-left transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-surface-2/60'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-md shrink-0',
                      isSelected ? 'bg-primary text-primary-foreground' : option.chipClass
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-foreground">{option.label}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {option.description}
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
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

const StepDeviceTypes: React.FC<StepProps> = ({
  formData,
  errors,
  onChange,
  legacyDeviceTypes,
}) => {
  const selected = formData.deviceTypes[0]

  return (
    <div className="space-y-5">
      {legacyDeviceTypes && (
        <div className="flex items-start gap-2.5 p-3 bg-warning-soft text-warning-soft-foreground rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-sm">
            该模板原先
            {legacyDeviceTypes.length > 0
              ? `声明适用于 ${legacyDeviceTypes.map(getDeviceTypeLabel).join('、')}`
              : '未声明适用设备类型'}
            。现在每个模板只能适用一种设备类型，请重新选择。
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          适用设备类型 <span className="text-danger">*</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          每个模板只适用一种设备类型，策略与巡检任务只能为该类设备选用此模板。
        </p>
        <div
          className="grid grid-cols-2 gap-3"
          role="radiogroup"
          aria-label="适用设备类型"
        >
          {INSPECTABLE_DEVICE_TYPE_OPTIONS.map((option) => {
            const isSelected = selected === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange('deviceTypes', [option.value])}
                className={cn(
                  'p-4 rounded-lg border text-center transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-surface-2/60'
                )}
              >
                <div className="text-2xl mb-2">{DEVICE_TYPE_ICONS[option.value]}</div>
                <div
                  className={cn(
                    'font-medium text-sm',
                    isSelected ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {option.label}
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          无线AP 通常由 AC 统一管理，暂不提供巡检模板。
        </p>
      </div>

      {errors.deviceTypes && (
        <div className="flex items-center gap-2 p-3 bg-danger-soft text-danger-soft-foreground rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-sm">{errors.deviceTypes}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Step 3: 检查项配置
// ============================================================================

interface CheckItemEditorInlineProps {
  item: InspectionCheckItem
  metricOptions: MetricOption[]
  onUpdate: (updates: Partial<InspectionCheckItem>) => void
  onDelete: () => void
  isExpanded: boolean
  onToggleExpand: () => void
}

const CheckItemEditorInline: React.FC<CheckItemEditorInlineProps> = ({
  item,
  metricOptions,
  onUpdate,
  onDelete,
  isExpanded,
  onToggleExpand,
}) => {
  const typeOption = CHECK_TYPE_OPTIONS.find((t) => t.value === item.type)
  const typeMeta = getCheckTypeMeta(item.type)

  const updateConfig = <K extends keyof NonNullable<InspectionCheckItem['config']>>(
    key: K,
    value: NonNullable<InspectionCheckItem['config']>[K]
  ) => {
    onUpdate({
      config: { ...item.config, [key]: value },
    })
  }

  const updateThreshold = (type: 'warning' | 'critical', value: string) => {
    const trimmed = value.trim()
    const parsed = trimmed === '' ? undefined : Number(trimmed)
    const numValue = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined

    const nextThreshold: { warning?: number; critical?: number } = {
      ...item.config.threshold,
      [type]: numValue,
    }
    if (nextThreshold.warning === undefined) {
      delete nextThreshold.warning
    }
    if (nextThreshold.critical === undefined) {
      delete nextThreshold.critical
    }

    const nextConfig = { ...item.config }
    if (Object.keys(nextThreshold).length === 0) {
      delete nextConfig.threshold
    } else {
      nextConfig.threshold = nextThreshold
    }

    onUpdate({ config: nextConfig })
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpand()
          }
        }}
        className={cn(
          'flex items-center gap-3 p-3.5 cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          isExpanded ? 'bg-primary/8' : 'bg-card hover:bg-surface-2/60'
        )}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm text-foreground">
              {item.name || '未命名检查项'}
            </span>
            <Badge variant={typeMeta.badgeVariant} size="sm">
              {typeOption?.label || item.type}
            </Badge>
            <Badge variant="secondary" size="sm" className="tabular-nums">
              权重: {item.weight}
            </Badge>
          </div>
          {item.config.oid && (
            <p className="text-xs font-mono text-muted-foreground mt-1">
              OID: {item.config.oid}
            </p>
          )}
          {item.config.command && (
            <p className="text-xs font-mono text-muted-foreground mt-1">
              命令: {item.config.command}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="删除检查项"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-danger" />
          </Button>
          <ChevronRight
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-border bg-surface-2/40 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${item.id}-name`}
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    检查项名称 <span className="text-danger">*</span>
                  </label>
                  <Input
                    id={`${item.id}-name`}
                    value={item.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    placeholder="例如：CPU 使用率"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${item.id}-weight`}
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    权重 (1-10)
                  </label>
                  <Input
                    id={`${item.id}-weight`}
                    type="number"
                    min={1}
                    max={10}
                    value={item.weight}
                    onChange={(e) =>
                      onUpdate({ weight: parseInt(e.target.value, 10) || 1 })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  检查类型
                </label>
                <div className="flex flex-wrap gap-2">
                  {CHECK_TYPE_OPTIONS.map((option) => {
                    const isSelected = item.type === option.value
                    const isDisabled = !option.supported && !isSelected
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (isSelected) return
                          onUpdate({ type: option.value, config: {}, metric: '' })
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-md border text-sm transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : isDisabled
                              ? 'opacity-50 cursor-not-allowed border-border text-muted-foreground'
                              : 'border-border bg-card text-foreground hover:bg-surface-2 cursor-pointer'
                        )}
                      >
                        {option.label}
                        {!option.supported && (
                          <span className="ml-1 text-xs text-warning">暂不支持</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {!isCheckItemTypeSupported(item.type) && (
                  <p className="text-xs text-warning mt-2">
                    当前版本执行引擎暂不支持该检查类型，执行时将被跳过；建议改为 Ping 或 SNMP。
                  </p>
                )}
              </div>

              {item.type === 'snmp' && (
                <div className="space-y-3 p-3.5 bg-card border border-border rounded-lg">
                  <h5 className="font-medium text-sm text-foreground">SNMP 配置</h5>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      采集指标 <span className="text-danger">*</span>
                    </label>
                    <Select
                      value={item.metric ?? ''}
                      onValueChange={(metric) => {
                        const option = metricOptions.find((o) => o.metric === metric)
                        onUpdate(
                          item.name.trim() || !option
                            ? { metric }
                            : { metric, name: option.label }
                        )
                      }}
                    >
                      <SelectTrigger aria-label="采集指标">
                        <SelectValue placeholder="选择采集指标" />
                      </SelectTrigger>
                      <SelectContent>
                        {metricOptions.map((option) => (
                          <SelectItem key={option.metric} value={option.metric}>
                            {option.label}（{option.metric}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      执行时按采集指标取数与判定，名称可随意修改；采集 OID 由系统按设备厂商自动选择
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        OID（可选）
                      </label>
                      <Input
                        value={item.config.oid || ''}
                        onChange={(e) => updateConfig('oid', e.target.value)}
                        placeholder="例如：1.3.6.1.2.1.1.3.0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        超时时间 (毫秒)
                      </label>
                      <Input
                        type="number"
                        value={item.config.timeout || ''}
                        onChange={(e) =>
                          updateConfig(
                            'timeout',
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                        placeholder="默认 5000"
                      />
                    </div>
                  </div>
                </div>
              )}

              {item.type === 'ssh' && (
                <div className="space-y-3 p-3.5 bg-card border border-border rounded-lg">
                  <h5 className="font-medium text-sm text-foreground">SSH 配置</h5>
                  <p className="text-xs text-warning">
                    提示：当前版本暂不执行 SSH 检查项（执行时会跳过），建议改为 Ping 或 SNMP。
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      执行命令 <span className="text-danger">*</span>
                    </label>
                    <Input
                      value={item.config.command || ''}
                      onChange={(e) => updateConfig('command', e.target.value)}
                      placeholder="例如：show version"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      超时时间 (毫秒)
                    </label>
                    <Input
                      type="number"
                      value={item.config.timeout || ''}
                      onChange={(e) =>
                        updateConfig(
                          'timeout',
                          e.target.value ? parseInt(e.target.value, 10) : undefined
                        )
                      }
                      placeholder="默认 30000"
                    />
                  </div>
                </div>
              )}

              {item.type === 'http' && (
                <div className="space-y-3 p-3.5 bg-card border border-border rounded-lg">
                  <h5 className="font-medium text-sm text-foreground">HTTP 配置</h5>
                  <p className="text-xs text-warning">
                    提示：当前版本暂不执行 HTTP 检查项（执行时会跳过），建议改为 Ping 或 SNMP。
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      请求 URL（可选）
                    </label>
                    <Input
                      value={item.config.url || ''}
                      onChange={(e) => updateConfig('url', e.target.value)}
                      placeholder="例如：http://device/api/status"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
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
                <div className="space-y-3 p-3.5 bg-card border border-border rounded-lg">
                  <h5 className="font-medium text-sm text-foreground">脚本配置</h5>
                  <p className="text-xs text-warning">
                    提示：当前版本暂不执行脚本检查项（执行时会跳过），建议改为 Ping 或 SNMP。
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      脚本内容
                    </label>
                    <TextArea
                      value={item.config.script || ''}
                      onChange={(e) => updateConfig('script', e.target.value)}
                      placeholder="输入自定义脚本..."
                      className="font-mono text-sm min-h-[96px] px-3 py-2"
                      rows={4}
                    />
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-card border border-border rounded-lg">
                <h5 className="font-medium text-sm text-foreground mb-3">
                  阈值配置 (可选)
                </h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor={`${item.id}-threshold-warning`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      警告阈值
                    </label>
                    <Input
                      id={`${item.id}-threshold-warning`}
                      type="number"
                      step="0.01"
                      value={item.config.threshold?.warning ?? ''}
                      onChange={(e) => updateThreshold('warning', e.target.value)}
                      placeholder="例如：70"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${item.id}-threshold-critical`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      严重阈值
                    </label>
                    <Input
                      id={`${item.id}-threshold-critical`}
                      type="number"
                      step="0.01"
                      value={item.config.threshold?.critical ?? ''}
                      onChange={(e) => updateThreshold('critical', e.target.value)}
                      placeholder="例如：90"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  <span>
                    {isLowerBoundedMetric(item.metric)
                      ? '该指标数值越低越危险，警告阈值应大于严重阈值'
                      : '警告阈值应小于严重阈值'}
                  </span>
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

  const { data: builtInData } = useInspectionTemplates({
    isBuiltIn: true,
    pageSize: 100,
  })
  const deviceType = formData.deviceTypes[0]
  const builtInTemplates = useMemo(() => builtInData?.templates ?? [], [builtInData])
  const builtInForType = builtInTemplates.find(
    (t) => deviceType && t.deviceTypes.includes(deviceType)
  )
  const metricOptions = useMemo(
    () => buildMetricOptions(builtInTemplates, deviceType),
    [builtInTemplates, deviceType]
  )

  const missingBuiltInItems = useMemo(() => {
    if (!builtInForType) return []
    const existing = new Set(formData.checkItems.map(checkItemKey).filter(Boolean))
    return builtInForType.checkItems.filter((item) => !existing.has(checkItemKey(item)))
  }, [builtInForType, formData.checkItems])

  const addCheckItem = () => {
    const newItem: InspectionCheckItem = {
      id: generateCheckItemId(),
      name: '',
      type: 'snmp',
      weight: 1,
      config: {},
    }
    onChange('checkItems', [...formData.checkItems, newItem])
    setExpandedId(newItem.id)
  }

  const updateCheckItem = (id: string, updates: Partial<InspectionCheckItem>) => {
    onChange(
      'checkItems',
      formData.checkItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    )
  }

  const deleteCheckItem = (id: string) => {
    onChange(
      'checkItems',
      formData.checkItems.filter((item) => item.id !== id)
    )
    if (expandedId === id) setExpandedId(null)
  }

  const addBuiltInItems = () => {
    const usedIds = new Set(formData.checkItems.map((item) => item.id))
    const newItems = missingBuiltInItems.map((item) => ({
      ...item,
      id: usedIds.has(item.id) ? generateCheckItemId() : item.id,
    }))
    onChange('checkItems', [...formData.checkItems, ...newItems])
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border border-border bg-info-soft/70">
        <div className="flex items-center gap-2 mb-2.5 text-info-soft-foreground">
          <Zap className="w-4 h-4" />
          <span className="font-medium text-sm">快速添加检查项</span>
        </div>
        {builtInForType ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBuiltInItems}
              disabled={missingBuiltInItems.length === 0}
              className="cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1" />
              从内置「{builtInForType.name}」添加
            </Button>
            <span className="text-xs text-muted-foreground">
              {missingBuiltInItems.length > 0
                ? `将添加 ${missingBuiltInItems.length} 项尚未包含的检查项，可再逐项调整阈值或删除`
                : '内置模板的检查项已全部包含'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">请先在上一步选择适用设备类型</p>
        )}
      </div>

      <div className="space-y-2.5">
        {formData.checkItems.length > 0 ? (
          formData.checkItems.map((item) => (
            <CheckItemEditorInline
              key={item.id}
              item={item}
              metricOptions={metricOptions}
              onUpdate={(updates) => updateCheckItem(item.id, updates)}
              onDelete={() => deleteCheckItem(item.id)}
              isExpanded={expandedId === item.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === item.id ? null : item.id)
              }
            />
          ))
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center bg-surface-2/30">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2.5" />
            <p className="text-sm text-muted-foreground">
              暂无检查项，点击下方按钮添加或使用预设
            </p>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full cursor-pointer"
        onClick={addCheckItem}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        添加检查项
      </Button>

      {errors.checkItems && (
        <div className="flex items-center gap-2 p-3 bg-danger-soft text-danger-soft-foreground rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-sm">{errors.checkItems}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Step 4: 预览确认
// ============================================================================

const StepPreview: React.FC<StepProps> = ({ formData }) => {
  const categoryOption = CATEGORY_OPTIONS.find((c) => c.value === formData.category)
  const CategoryIcon = categoryOption?.icon || FileText
  const categoryMeta = getCategoryMeta(formData.category)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <CategoryIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-semibold text-foreground">
                {formData.name || '未命名模板'}
              </h4>
              {formData.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formData.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2.5">
                <Badge variant={categoryMeta.badgeVariant} size="sm">
                  {categoryMeta.label}
                </Badge>
                {formData.isActive ? (
                  <Badge variant="success" size="sm">
                    已启用
                  </Badge>
                ) : (
                  <Badge variant="outline" size="sm">
                    已禁用
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h5 className="font-medium text-sm text-foreground mb-2.5 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            适用设备类型
          </h5>
          <div className="flex flex-wrap gap-2">
            {formData.deviceTypes.map((type) => (
              <Badge key={type} variant="secondary" size="sm" className="px-2.5 py-1">
                {DEVICE_TYPE_ICONS[type] && (
                  <span className="mr-1">{DEVICE_TYPE_ICONS[type]}</span>
                )}
                {getDeviceTypeLabel(type)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h5 className="font-medium text-sm text-foreground mb-2.5 flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            检查项配置 ({formData.checkItems.length} 项)
          </h5>
          <div className="space-y-2">
            {formData.checkItems.map((item, index) => {
              const typeMeta = getCheckTypeMeta(item.type)
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2.5 bg-surface-2/50 border border-border/60 rounded-lg"
                >
                  <span className="text-muted-foreground font-mono text-xs w-6 tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-foreground">
                      {item.name || '未命名'}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2">
                      ({typeMeta.shortLabel})
                    </span>
                  </div>
                  <Badge variant="outline" size="sm" className="tabular-nums">
                    权重: {item.weight}
                  </Badge>
                  {item.config.threshold?.warning !== undefined &&
                    item.config.threshold?.critical !== undefined && (
                      <Badge variant="warning" size="sm" className="tabular-nums">
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

export const CreateTemplateWizard: React.FC<Props> = ({
  template,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<TemplateFormData>(() => {
    if (template) {
      return {
        name: template.name,
        description: template.description,
        category: template.category,
        deviceTypes: initialDeviceTypes(template.deviceTypes),
        checkItems: [...template.checkItems],
        isActive: template.isActive ?? true,
      }
    }
    return createInitialFormState()
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const legacyDeviceTypes =
    template && initialDeviceTypes(template.deviceTypes).length === 0
      ? template.deviceTypes
      : undefined

  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const isEditing = !!template
  const isLoading = createTemplate.isPending || updateTemplate.isPending

  const handleChange = useCallback(
    <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }))
      }
    },
    [errors]
  )

  const validateStep = useCallback(
    (step: number): boolean => {
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
          if (
            formData.deviceTypes.length !== 1 ||
            !isInspectableDeviceType(formData.deviceTypes[0])
          ) {
            newErrors.deviceTypes = '请选择模板适用的设备类型'
          }
          break
        case 3:
          if (formData.checkItems.length === 0) {
            newErrors.checkItems = '请至少添加一个检查项'
          } else {
            for (const item of formData.checkItems) {
              if (!item.name.trim()) {
                newErrors.checkItems = '所有检查项都必须有名称'
                break
              }
              if (item.type === 'snmp' && !item.metric?.trim()) {
                newErrors.checkItems = `SNMP 检查项必须选择采集指标：「${item.name}」`
                break
              }
              if (item.type === 'snmp' && typeof item.config.oid === 'string') {
                const oid = item.config.oid.trim()
                if (oid && !OID_PATTERN.test(oid)) {
                  newErrors.checkItems =
                    'SNMP 类型的检查项 OID 格式无效，应由数字和点组成'
                  break
                }
              }
              if (item.type === 'ssh' && !item.config.command?.trim()) {
                newErrors.checkItems =
                  'SSH 类型的检查项必须配置命令（否则无法保存）'
                break
              }
              if (item.config.threshold) {
                const { warning, critical } = item.config.threshold
                const hasWarning = warning !== undefined
                const hasCritical = critical !== undefined
                if (hasWarning !== hasCritical) {
                  newErrors.checkItems =
                    '警告阈值和严重阈值需同时填写，或全部留空'
                  break
                }
                if (warning !== undefined && critical !== undefined) {
                  if (isLowerBoundedMetric(item.metric)) {
                    if (warning <= critical) {
                      newErrors.checkItems =
                        '该指标数值越低越危险，警告阈值必须大于严重阈值'
                      break
                    }
                  } else if (warning >= critical) {
                    newErrors.checkItems = '警告阈值必须小于严重阈值'
                    break
                  }
                }
              }
            }
          }
          break
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
    [formData]
  )

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length))
    }
  }

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    try {
      if (isEditing && template) {
        await updateTemplate.mutateAsync({
          id: template.id,
          data: formData,
        })
      } else {
        await createTemplate.mutateAsync(formData)
      }
      onSuccess()
    } catch (saveError) {
      console.error('Save template failed:', saveError)
    }
  }

  const renderStepContent = () => {
    const stepProps: StepProps = {
      formData,
      errors,
      onChange: handleChange,
      legacyDeviceTypes,
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
    <SimpleModal
      open
      onClose={() => {
        if (!isLoading) {
          onClose()
        }
      }}
      ariaLabel={isEditing ? '编辑巡检模板' : '创建巡检模板'}
      size="4xl"
    >
      <div className="flex flex-col gap-4">
        {/* 头部 */}
        <div className="border-b border-border pb-3 pr-6">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? '编辑巡检模板' : '创建巡检模板'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {STEPS[currentStep - 1].description}
          </p>
        </div>

        {/* 步骤指示器 */}
        <div className="rounded-lg border border-border bg-surface-2/50 px-4 py-3">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id
              const Icon = step.icon

              return (
                <React.Fragment key={step.id}>
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isCompleted
                            ? 'bg-success text-success-foreground'
                            : 'bg-surface-3 text-muted-foreground'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="hidden sm:block">
                      <div
                        className={cn(
                          'text-sm font-medium',
                          isActive ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {step.title}
                      </div>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-3',
                        isCompleted ? 'bg-success' : 'bg-border'
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.16 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div>
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrev}
                disabled={isLoading}
                className="cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                上一步
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="cursor-pointer"
            >
              取消
            </Button>
            {currentStep < STEPS.length ? (
              <Button type="button" onClick={handleNext} className="cursor-pointer">
                下一步
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                loading={isLoading}
                disabled={isLoading}
                className="cursor-pointer"
              >
                {!isLoading && <Save className="w-4 h-4 mr-1.5" />}
                {isLoading ? '保存中...' : isEditing ? '保存修改' : '创建模板'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </SimpleModal>
  )
}

export default CreateTemplateWizard
