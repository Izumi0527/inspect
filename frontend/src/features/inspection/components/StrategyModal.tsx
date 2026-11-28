import React, { useState, useEffect } from 'react'
import { Calendar, FileText, Settings, Search, X, CheckSquare, Square, Clock } from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge,
} from '@/components/atoms'
import { Input as BaseInput, TextArea } from '@/components/atoms/input'
import { SimpleModal } from '@/components/atoms/modal'
import { Switch } from '@/components/atoms/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils/cn'
import { useCreateStrategy, useUpdateStrategy, useInspectionTemplates } from '../hooks/useInspection'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { deviceMatchesTemplate, getDeviceTypeLabel } from '@/utils/deviceTypes'
import { InspectionStrategy } from '../types'
import {
  StrategyType,
  ScheduleMode,
  WeekdayValue,
  ScheduleFormData,
  DEFAULT_CRON,
  DEFAULT_SCHEDULE,
  scheduleModeOptions,
  weekdayOptions,
  monthDayOptions,
  buildCronFromSchedule,
  parseCronToSchedule,
  describeSchedule,
} from '../utils/strategySchedule'

interface Props {
  strategy: InspectionStrategy | null
  onClose: () => void
  onSuccess: () => void
}

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
  cron: DEFAULT_CRON,
  devices: [],
  templates: [],
  enabled: true,
})

export const StrategyModal: React.FC<Props> = ({ strategy, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<StrategyFormData>(() => createInitialFormState())
  const [scheduleData, setScheduleData] = useState<ScheduleFormData>(() => DEFAULT_SCHEDULE)
  const [errors, setErrors] = useState<Partial<Record<keyof StrategyFormData, string>>>({})
  const [deviceSearch, setDeviceSearch] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  // 切换模板后自动移除了哪些设备的说明，避免设备「凭空消失」
  const [deviceNotice, setDeviceNotice] = useState('')

  const createStrategy = useCreateStrategy()
  const updateStrategy = useUpdateStrategy()

  // 获取设备列表（禁用轮询，手动触发加载全部设备）
  const { devices: allDevices, loading: devicesLoading, loadDevices } = useDevices(false)

  // 获取模板列表
  const { data: templatesData, isLoading: templatesLoading } = useInspectionTemplates({ pageSize: 100 })
  const allTemplates = templatesData?.templates || []

  const isEditing = !!strategy

  // 初始加载设备列表（不分页，获取全部）
  useEffect(() => {
    loadDevices({ page: 1, page_size: 1000 })
  }, [loadDevices])

  useEffect(() => {
    if (strategy) {
      const cron = strategy.cron || DEFAULT_CRON
      setFormData({
        name: strategy.name,
        description: strategy.description,
        type: strategy.type,
        cron,
        devices: [...strategy.devices],
        templates: strategy.templates.slice(0, 1),
        enabled: strategy.enabled,
      })
      setScheduleData(parseCronToSchedule(cron))
    } else {
      setFormData(createInitialFormState())
      setScheduleData(DEFAULT_SCHEDULE)
    }
  }, [strategy])

  const handleInputChange = <K extends keyof StrategyFormData>(
    field: K,
    value: StrategyFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleTypeChange = (value: string) => {
    if (value === 'scheduled' || value === 'manual') {
      handleInputChange('type', value)
    }
  }

  const handleScheduleChange = (updates: Partial<ScheduleFormData>) => {
    const next = { ...scheduleData, ...updates }
    setScheduleData(next)
    setFormData((current) => ({ ...current, cron: buildCronFromSchedule(next, current.cron) }))
    if (errors.cron) {
      setErrors((current) => ({ ...current, cron: undefined }))
    }
  }

  // 切换设备选择
  const toggleDevice = (deviceId: number) => {
    const newDevices = formData.devices.includes(deviceId)
      ? formData.devices.filter((id) => id !== deviceId)
      : [...formData.devices, deviceId]
    handleInputChange('devices', newDevices)
  }

  const findTemplate = (templateId?: number) =>
    allTemplates.find((t) => Number(t.id) === templateId)
  const selectedTemplate = findTemplate(formData.templates[0])
  const templateTypeText = (template: { deviceTypes: string[] }) =>
    template.deviceTypes.map(getDeviceTypeLabel).join('、')

  // 已选设备中与模板适用类型不符的（已删除、列表里查不到的设备交给后端判定）
  const findMismatchedDevices = (
    template: { deviceTypes: string[] } | undefined,
    deviceIds: number[]
  ) => {
    if (!template) return []
    return deviceIds
      .map((id) => allDevices.find((d) => d.id === id))
      .filter(
        (device): device is NonNullable<typeof device> =>
          !!device && !deviceMatchesTemplate(template.deviceTypes, device.device_type)
      )
  }

  // 切换模板选择：交换机模板只巡检交换机，换模板时移除类型不符的已选设备并说明
  const toggleTemplate = (templateId: number) => {
    const newTemplates = formData.templates.includes(templateId) ? [] : [templateId]
    handleInputChange('templates', newTemplates)

    const next = findTemplate(newTemplates[0])
    const removed = findMismatchedDevices(next, formData.devices)
    if (next && removed.length > 0) {
      const removedIds = new Set(removed.map((device) => device.id))
      handleInputChange(
        'devices',
        formData.devices.filter((id) => !removedIds.has(id))
      )
      setDeviceNotice(
        `已移除 ${removed.length} 台与「${next.name}」适用类型（${templateTypeText(next)}）不符的设备`
      )
    } else {
      setDeviceNotice('')
    }
  }

  // 过滤设备：只列出所选模板适用类型的设备
  const filteredDevices = selectedTemplate
    ? allDevices.filter(
        (device) =>
          deviceMatchesTemplate(selectedTemplate.deviceTypes, device.device_type) &&
          (device.name.toLowerCase().includes(deviceSearch.toLowerCase()) ||
            device.ip.toLowerCase().includes(deviceSearch.toLowerCase()))
      )
    : []

  const allFilteredSelected =
    filteredDevices.length > 0 &&
    filteredDevices.every((device) => formData.devices.includes(device.id))

  const handleToggleSelectAllDevices = () => {
    if (filteredDevices.length === 0) return
    if (allFilteredSelected) {
      const visibleIds = new Set(filteredDevices.map((device) => device.id))
      handleInputChange(
        'devices',
        formData.devices.filter((id) => !visibleIds.has(id))
      )
      return
    }
    const merged = new Set(formData.devices)
    for (const device of filteredDevices) {
      merged.add(device.id)
    }
    handleInputChange('devices', Array.from(merged))
  }

  // 过滤模板
  const filteredTemplates = allTemplates.filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  )

  const getDeviceName = (deviceId: number) => {
    const device = allDevices.find((d) => d.id === deviceId)
    return device ? device.name : `设备-${deviceId}`
  }

  const getTemplateName = (templateId: number) => {
    const template = allTemplates.find((t) => Number(t.id) === templateId)
    return template ? template.name : `模板-${templateId}`
  }

  const validateForm = () => {
    const newErrors: Partial<Record<keyof StrategyFormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = '请输入策略名称'
    } else if (formData.name.length > 100) {
      newErrors.name = '策略名称不能超过100个字符'
    }

    if (formData.description.length > 500) {
      newErrors.description = '策略描述不能超过500个字符'
    }

    if (formData.type === 'scheduled') {
      const requiresTime =
        scheduleData.mode !== 'hourly' &&
        scheduleData.mode !== 'half_hourly' &&
        scheduleData.mode !== 'custom'
      if (requiresTime && !/^\d{2}:\d{2}$/.test(scheduleData.time)) {
        newErrors.cron = '请选择执行时刻'
      } else if (!formData.cron.trim()) {
        newErrors.cron = '请选择执行时间'
      } else if (formData.cron.length > 100) {
        newErrors.cron = '执行时间配置不能超过100个字符'
      }
    }

    if (formData.devices.length === 0) {
      newErrors.devices = '请选择至少一个设备'
    }

    if (formData.templates.length === 0) {
      newErrors.templates = '请选择一个巡检模板'
    }

    const mismatched = findMismatchedDevices(selectedTemplate, formData.devices)
    if (selectedTemplate && mismatched.length > 0) {
      newErrors.devices = `以下设备与模板「${selectedTemplate.name}」的适用类型（${templateTypeText(selectedTemplate)}）不符，请移除：${mismatched
        .map((device) => `${device.name}（${getDeviceTypeLabel(device.device_type)}）`)
        .join('、')}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    try {
      const payload = {
        ...formData,
        cron:
          formData.type === 'scheduled'
            ? buildCronFromSchedule(scheduleData, formData.cron)
            : undefined,
      }
      if (isEditing && strategy) {
        await updateStrategy.mutateAsync({ id: strategy.id, data: payload })
      } else {
        await createStrategy.mutateAsync(payload)
      }
      onSuccess()
    } catch (saveError) {
      console.error('Save strategy failed:', saveError)
    }
  }

  const isLoading = createStrategy.isPending || updateStrategy.isPending

  return (
    <SimpleModal
      open
      onClose={() => {
        if (!isLoading) {
          onClose()
        }
      }}
      title={isEditing ? '编辑巡检策略' : '创建巡检策略'}
      size="5xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
          {/* 左栏：基本信息 + 执行计划 */}
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground pb-2 border-b border-border">
                <FileText className="w-4 h-4 text-primary" />
                基本信息
              </h3>

              <div>
                <label
                  htmlFor="strategy-name-input"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  策略名称 <span className="text-danger">*</span>
                </label>
                <Input
                  id="strategy-name-input"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="请输入策略名称"
                  className={errors.name ? 'border-danger' : ''}
                  maxLength={100}
                />
                <div className="flex justify-between items-center mt-1">
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
                  htmlFor="strategy-description-input"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  策略描述
                </label>
                <TextArea
                  id="strategy-description-input"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="请输入策略描述（可选）"
                  maxLength={500}
                  className={cn(
                    'min-h-[68px]',
                    errors.description && 'border-danger'
                  )}
                  rows={2}
                />
                <div className="flex justify-end mt-1">
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      formData.description.length > 400 ? 'text-warning' : 'text-muted-foreground'
                    )}
                  >
                    {formData.description.length}/500
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    策略类型 <span className="text-danger">*</span>
                  </label>
                  <Select value={formData.type} onValueChange={handleTypeChange}>
                    <SelectTrigger aria-label="策略类型">
                      <SelectValue placeholder="选择策略类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">定时巡检</SelectItem>
                      <SelectItem value="manual">手动巡检</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 h-9">
                    <span className="text-sm text-foreground">启用策略</span>
                    <Switch
                      checked={formData.enabled}
                      onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                      aria-label="启用策略"
                      className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 执行时间配置 */}
            {formData.type === 'scheduled' && (
              <section className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground pb-2 border-b border-border">
                  <Calendar className="w-4 h-4 text-primary" />
                  执行时间
                </h3>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    执行频率 <span className="text-danger">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      value={scheduleData.mode}
                      onValueChange={(value) => handleScheduleChange({ mode: value as ScheduleMode })}
                    >
                      <SelectTrigger
                        aria-label="执行频率"
                        className={errors.cron ? 'border-danger' : ''}
                      >
                        <SelectValue
                          placeholder={
                            scheduleData.mode === 'custom'
                              ? '沿用原执行计划'
                              : scheduleModeOptions.find((option) => option.value === scheduleData.mode)
                                  ?.label
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {scheduleData.mode === 'custom' && (
                          <SelectItem value="custom">沿用原执行计划</SelectItem>
                        )}
                        {scheduleModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {scheduleData.mode === 'weekly' && (
                      <Select
                        value={scheduleData.weekday}
                        onValueChange={(value) =>
                          handleScheduleChange({ weekday: value as WeekdayValue })
                        }
                      >
                        <SelectTrigger aria-label="每周执行日">
                          <SelectValue
                            placeholder={
                              weekdayOptions.find((option) => option.value === scheduleData.weekday)
                                ?.label
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {weekdayOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {scheduleData.mode === 'monthly' && (
                      <Select
                        value={scheduleData.monthDay}
                        onValueChange={(value) => handleScheduleChange({ monthDay: value })}
                      >
                        <SelectTrigger aria-label="每月执行日期">
                          <SelectValue
                            placeholder={
                              monthDayOptions.find((option) => option.value === scheduleData.monthDay)
                                ?.label
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {monthDayOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {scheduleData.mode !== 'hourly' &&
                      scheduleData.mode !== 'half_hourly' &&
                      scheduleData.mode !== 'custom' && (
                        <Input
                          type="time"
                          aria-label="执行时刻"
                          value={scheduleData.time}
                          onChange={(e) => handleScheduleChange({ time: e.target.value })}
                          className={errors.cron ? 'border-danger' : ''}
                        />
                      )}
                  </div>
                  {errors.cron && <p className="text-xs text-danger mt-1">{errors.cron}</p>}
                </div>

                <div className="flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {describeSchedule(scheduleData)}
                    {scheduleData.mode === 'custom'
                      ? '；选择上方常用频率后可改为新的执行计划。'
                      : ''}
                  </span>
                </div>
              </section>
            )}
          </div>

          {/* 右栏：两步目标配置（1. 选模板 -> 2. 选设备） */}
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground pb-2 border-b border-border">
                <Settings className="w-4 h-4 text-primary" />
                目标配置
              </h3>

              {/* 步骤 1：巡检模板 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      1
                    </span>
                    巡检模板 <span className="text-danger">*</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      ({formData.templates.length} 个)
                    </span>
                  </label>
                </div>

                <div
                  className={cn(
                    'border rounded-lg overflow-hidden bg-card',
                    errors.templates ? 'border-danger' : 'border-border'
                  )}
                >
                  {/* 已选模板 */}
                  <div className="px-3 py-2 bg-surface-2/70 border-b border-border min-h-[42px] flex items-center">
                    {formData.templates.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.templates.map((templateId) => (
                          <Badge key={templateId} variant="primary" className="gap-1">
                            {getTemplateName(templateId)}
                            <button
                              type="button"
                              onClick={() => toggleTemplate(templateId)}
                              aria-label="移除已选模板"
                              className="ml-0.5 cursor-pointer hover:opacity-80"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">请从下方列表选择一个巡检模板</p>
                    )}
                  </div>

                  {/* 模板搜索与单选列表 */}
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <BaseInput
                        type="text"
                        aria-label="搜索模板"
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="搜索模板..."
                        className="h-8 pl-8 pr-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="max-h-[152px] overflow-y-auto divide-y divide-border/50">
                    {templatesLoading ? (
                      <p className="p-3 text-sm text-muted-foreground">加载中...</p>
                    ) : filteredTemplates.length > 0 ? (
                      filteredTemplates.map((template) => {
                        const checked = formData.templates.includes(Number(template.id))
                        return (
                          <label
                            key={template.id}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
                              checked ? 'bg-primary/10' : 'hover:bg-surface-2/70'
                            )}
                          >
                            <input
                              type="radio"
                              name="inspection-template"
                              checked={checked}
                              onChange={() => toggleTemplate(Number(template.id))}
                              className="border-border text-primary focus:ring-ring/40 cursor-pointer"
                            />
                            <span className="text-sm text-foreground flex-1 truncate">
                              {template.name}
                            </span>
                            {template.deviceTypes.length > 0 && (
                              <Badge variant="outline" size="sm">
                                {templateTypeText(template)}
                              </Badge>
                            )}
                            {template.isBuiltIn && (
                              <Badge variant="success" size="sm">
                                内置
                              </Badge>
                            )}
                          </label>
                        )
                      })
                    ) : (
                      <p className="p-3 text-sm text-muted-foreground">暂无模板</p>
                    )}
                  </div>
                </div>
                {errors.templates && <p className="text-xs text-danger mt-1">{errors.templates}</p>}
              </div>

              {/* 步骤 2：目标设备 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      2
                    </span>
                    目标设备 <span className="text-danger">*</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      ({formData.devices.length} 个)
                    </span>
                  </label>
                  {selectedTemplate && filteredDevices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAllDevices}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                    >
                      {allFilteredSelected ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          取消全选
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3.5 h-3.5" />
                          全选当前 ({filteredDevices.length})
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div
                  className={cn(
                    'border rounded-lg overflow-hidden bg-card',
                    errors.devices ? 'border-danger' : 'border-border'
                  )}
                >
                  {/* 已选设备 */}
                  <div className="px-3 py-2 bg-surface-2/70 border-b border-border min-h-[42px] max-h-[84px] overflow-y-auto flex items-center">
                    {formData.devices.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.devices.map((deviceId) => (
                          <Badge key={deviceId} variant="secondary" className="gap-1">
                            {getDeviceName(deviceId)}
                            <button
                              type="button"
                              onClick={() => toggleDevice(deviceId)}
                              aria-label={`移除设备 ${getDeviceName(deviceId)}`}
                              className="ml-0.5 cursor-pointer hover:text-danger"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">请从下方列表选择设备</p>
                    )}
                  </div>

                  {/* 设备搜索与多选列表 */}
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <BaseInput
                        type="text"
                        aria-label="搜索目标设备"
                        value={deviceSearch}
                        onChange={(e) => setDeviceSearch(e.target.value)}
                        placeholder="搜索设备名称或 IP..."
                        className="h-8 pl-8 pr-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="max-h-[168px] overflow-y-auto divide-y divide-border/50">
                    {!selectedTemplate ? (
                      <p className="p-3 text-sm text-muted-foreground">请先选择巡检模板</p>
                    ) : devicesLoading ? (
                      <p className="p-3 text-sm text-muted-foreground">加载中...</p>
                    ) : filteredDevices.length > 0 ? (
                      filteredDevices.map((device) => {
                        const checked = formData.devices.includes(device.id)
                        return (
                          <label
                            key={device.id}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
                              checked ? 'bg-primary/10' : 'hover:bg-surface-2/70'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDevice(device.id)}
                              className="rounded border-border text-primary focus:ring-ring/40 cursor-pointer"
                            />
                            <span className="text-sm text-foreground flex-1 truncate">
                              {device.name}
                            </span>
                            <Badge variant="outline" size="sm">
                              {getDeviceTypeLabel(device.device_type)}
                            </Badge>
                            <span className="text-xs font-mono tabular-nums text-muted-foreground">
                              {device.ip}
                            </span>
                          </label>
                        )
                      })
                    ) : (
                      <p className="p-3 text-sm text-muted-foreground">
                        暂无适用于「{selectedTemplate.name}」的设备（{templateTypeText(selectedTemplate)}）
                      </p>
                    )}
                  </div>
                </div>
                {errors.devices && <p className="text-xs text-danger mt-1">{errors.devices}</p>}
                {deviceNotice && !errors.devices && (
                  <p className="text-xs text-warning mt-1">{deviceNotice}</p>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* 底部操作按钮（位于 form 内以支持原生提交） */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {selectedTemplate
              ? `已选模板「${selectedTemplate.name}」，关联 ${formData.devices.length} 台设备`
              : '请先选择巡检模板后再配置目标设备'}
          </p>
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
            <Button type="submit" disabled={isLoading} className="cursor-pointer">
              {isLoading ? '保存中...' : isEditing ? '保存修改' : '创建策略'}
            </Button>
          </div>
        </div>
      </form>
    </SimpleModal>
  )
}
