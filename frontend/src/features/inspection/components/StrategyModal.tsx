import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, FileText, Settings, Search } from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useCreateStrategy, useUpdateStrategy, useInspectionTemplates } from '../hooks/useInspection'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { InspectionStrategy } from '../types'

interface Props {
  strategy: InspectionStrategy | null
  onClose: () => void
  onSuccess: () => void
}

type StrategyType = 'scheduled' | 'manual'
type ScheduleMode = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'half_hourly' | 'custom'
type WeekdayValue = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

interface StrategyFormData {
  name: string
  description: string
  type: StrategyType
  cron: string
  devices: number[]
  templates: number[]
  enabled: boolean
}

interface ScheduleFormData {
  mode: ScheduleMode
  time: string
  weekday: WeekdayValue
  monthDay: string
}

const DEFAULT_CRON = '0 0 2 * * ?'

const DEFAULT_SCHEDULE: ScheduleFormData = {
  mode: 'daily',
  time: '02:00',
  weekday: 'MON',
  monthDay: '1'
}

const scheduleModeOptions: Array<{ value: Exclude<ScheduleMode, 'custom'>; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'hourly', label: '每小时' },
  { value: 'half_hourly', label: '每30分钟' }
]

const weekdayOptions: Array<{ value: WeekdayValue; label: string }> = [
  { value: 'MON', label: '周一' },
  { value: 'TUE', label: '周二' },
  { value: 'WED', label: '周三' },
  { value: 'THU', label: '周四' },
  { value: 'FRI', label: '周五' },
  { value: 'SAT', label: '周六' },
  { value: 'SUN', label: '周日' }
]

const monthDayOptions = Array.from({ length: 28 }, (_, index) => {
  const day = String(index + 1)
  return { value: day, label: `${day}日` }
})

const createInitialFormState = (): StrategyFormData => ({
  name: '',
  description: '',
  type: 'scheduled',
  cron: DEFAULT_CRON,
  devices: [],
  templates: [],
  enabled: true
})

const normalizeTime = (value: string): string => (/^\d{2}:\d{2}$/.test(value) ? value : DEFAULT_SCHEDULE.time)

const splitTime = (value: string) => {
  const [hour = '02', minute = '00'] = normalizeTime(value).split(':')
  return {
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10)
  }
}

const buildCronFromSchedule = (schedule: ScheduleFormData, fallbackCron: string): string => {
  if (schedule.mode === 'custom') {
    return fallbackCron || DEFAULT_CRON
  }

  if (schedule.mode === 'hourly') {
    return '0 0 * * * ?'
  }

  if (schedule.mode === 'half_hourly') {
    return '0 */30 * * * ?'
  }

  const { hour, minute } = splitTime(schedule.time)

  if (schedule.mode === 'weekly') {
    return `0 ${minute} ${hour} ? * ${schedule.weekday}`
  }

  if (schedule.mode === 'monthly') {
    return `0 ${minute} ${hour} ${schedule.monthDay} * ?`
  }

  return `0 ${minute} ${hour} * * ?`
}

const parseCronToSchedule = (cron?: string): ScheduleFormData => {
  if (!cron) return DEFAULT_SCHEDULE

  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 6 || parts[0] !== '0') {
    return { ...DEFAULT_SCHEDULE, mode: 'custom' }
  }

  const [, minute, hour, day, month, weekday] = parts

  if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'hourly' }
  }

  if (minute === '*/30' && hour === '*' && day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'half_hourly' }
  }

  const hourNumber = Number.parseInt(hour, 10)
  const minuteNumber = Number.parseInt(minute, 10)
  const hasValidTime = Number.isInteger(hourNumber) && Number.isInteger(minuteNumber)
  const time = hasValidTime
    ? `${String(hourNumber).padStart(2, '0')}:${String(minuteNumber).padStart(2, '0')}`
    : DEFAULT_SCHEDULE.time

  if (hasValidTime && day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'daily', time }
  }

  if (
    hasValidTime &&
    day === '?' &&
    month === '*' &&
    weekdayOptions.some((option) => option.value === weekday)
  ) {
    return { ...DEFAULT_SCHEDULE, mode: 'weekly', time, weekday: weekday as WeekdayValue }
  }

  if (hasValidTime && month === '*' && weekday === '?' && monthDayOptions.some((option) => option.value === day)) {
    return { ...DEFAULT_SCHEDULE, mode: 'monthly', time, monthDay: day }
  }

  return { ...DEFAULT_SCHEDULE, mode: 'custom' }
}

const describeSchedule = (schedule: ScheduleFormData): string => {
  const weekday = weekdayOptions.find((option) => option.value === schedule.weekday)?.label ?? '周一'
  const monthDay = monthDayOptions.find((option) => option.value === schedule.monthDay)?.label ?? '1日'

  if (schedule.mode === 'custom') {
    return '沿用原有执行计划'
  }
  if (schedule.mode === 'hourly') {
    return '每小时整点执行'
  }
  if (schedule.mode === 'half_hourly') {
    return '每30分钟执行一次'
  }
  if (schedule.mode === 'weekly') {
    return `每周${weekday} ${schedule.time} 执行`
  }
  if (schedule.mode === 'monthly') {
    return `每月${monthDay} ${schedule.time} 执行`
  }
  return `每天 ${schedule.time} 执行`
}

export const StrategyModal: React.FC<Props> = ({ strategy, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<StrategyFormData>(() => createInitialFormState())
  const [scheduleData, setScheduleData] = useState<ScheduleFormData>(() => DEFAULT_SCHEDULE)
  const [errors, setErrors] = useState<Partial<Record<keyof StrategyFormData, string>>>({})
  const [deviceSearch, setDeviceSearch] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [_showDeviceSelector, _setShowDeviceSelector] = useState(false)
  const [_showTemplateSelector, _setShowTemplateSelector] = useState(false)

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
        enabled: strategy.enabled
      })
      setScheduleData(parseCronToSchedule(cron))
    } else {
      setFormData(createInitialFormState())
      setScheduleData(DEFAULT_SCHEDULE)
    }
  }, [strategy])

  const handleInputChange = <K extends keyof StrategyFormData>(field: K, value: StrategyFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
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
    setFormData(current => ({ ...current, cron: buildCronFromSchedule(next, current.cron) }))
    if (errors.cron) {
      setErrors(current => ({ ...current, cron: undefined }))
    }
  }

  // 切换设备选择
  const toggleDevice = (deviceId: number) => {
    const newDevices = formData.devices.includes(deviceId)
      ? formData.devices.filter(id => id !== deviceId)
      : [...formData.devices, deviceId]
    handleInputChange('devices', newDevices)
  }

  // 切换模板选择
  const toggleTemplate = (templateId: number) => {
    const newTemplates = formData.templates.includes(templateId)
      ? []
      : [templateId]
    handleInputChange('templates', newTemplates)
  }

  // 过滤设备
  const filteredDevices = allDevices.filter(device => 
    device.name.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    device.ip.toLowerCase().includes(deviceSearch.toLowerCase())
  )

  // 过滤模板
  const filteredTemplates = allTemplates.filter(template =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  )

  // 获取设备名称
  const getDeviceName = (deviceId: number) => {
    const device = allDevices.find(d => d.id === deviceId)
    return device ? device.name : `设备-${deviceId}`
  }

  // 获取模板名称
  const getTemplateName = (templateId: number) => {
    const template = allTemplates.find(t => Number(t.id) === templateId)
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
      if (!formData.cron.trim()) {
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    try {
      const payload = {
        ...formData,
        cron: formData.type === 'scheduled' ? buildCronFromSchedule(scheduleData, formData.cron) : formData.cron
      }
      if (isEditing && strategy) {
        await updateStrategy.mutateAsync({ id: strategy.id, data: payload })
      } else {
        await createStrategy.mutateAsync(payload)
      }
      onSuccess()
    } catch (error) {
      console.error('Save strategy failed:', error)
    }
  }

  const isLoading = createStrategy.isPending || updateStrategy.isPending

  return (
    <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-foreground">
            {isEditing ? '编辑巡检策略' : '创建巡检策略'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 表单内容 - 横向两栏布局 */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左栏：基本信息 + 执行时间 */}
            <div className="space-y-5">
              <div className="space-y-4">
                <h3 className="text-base font-medium flex items-center gap-2 text-foreground pb-2 border-b border-border">
                  <FileText className="w-4 h-4 text-blue-600" />
                  基本信息
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    策略名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="请输入策略名称"
                    className={errors.name ? 'border-red-500' : ''}
                    maxLength={100}
                  />
                  <div className="flex justify-between items-center mt-1">
                    {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                    <span className={`text-xs ml-auto ${formData.name.length > 80 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {formData.name.length}/100
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    策略描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="请输入策略描述（可选）"
                    maxLength={500}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 resize-none ${
                      errors.description ? 'border-red-500' : 'border-border'
                    }`}
                    rows={2}
                  />
                  <div className="flex justify-end mt-1">
                    <span className={`text-xs ${formData.description.length > 400 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {formData.description.length}/500
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      策略类型 <span className="text-red-500">*</span>
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

                  <div className="flex items-end pb-1">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enabled}
                        onChange={(e) => handleInputChange('enabled', e.target.checked)}
                        className="rounded border-border text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="ml-2 text-sm text-muted-foreground">启用策略</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 执行时间配置 */}
              {formData.type === 'scheduled' && (
                <div className="space-y-4">
                  <h3 className="text-base font-medium flex items-center gap-2 text-foreground pb-2 border-b border-border">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    执行时间
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      执行频率 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        value={scheduleData.mode}
                        onValueChange={(value) => handleScheduleChange({ mode: value as ScheduleMode })}
                      >
                        <SelectTrigger aria-label="执行频率" className={errors.cron ? 'border-red-500' : ''}>
                          <SelectValue
                            placeholder={
                              scheduleData.mode === 'custom'
                                ? '沿用原执行计划'
                                : scheduleModeOptions.find((option) => option.value === scheduleData.mode)?.label
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
                          onValueChange={(value) => handleScheduleChange({ weekday: value as WeekdayValue })}
                        >
                          <SelectTrigger aria-label="每周执行日">
                            <SelectValue
                              placeholder={weekdayOptions.find((option) => option.value === scheduleData.weekday)?.label}
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
                              placeholder={monthDayOptions.find((option) => option.value === scheduleData.monthDay)?.label}
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

                      {scheduleData.mode !== 'hourly' && scheduleData.mode !== 'half_hourly' && scheduleData.mode !== 'custom' && (
                        <Input
                          type="time"
                          aria-label="执行时刻"
                          value={scheduleData.time}
                          onChange={(e) => handleScheduleChange({ time: e.target.value })}
                          className={errors.cron ? 'border-red-500' : ''}
                        />
                      )}
                    </div>
                    {errors.cron && <p className="text-xs text-red-500 mt-1">{errors.cron}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {describeSchedule(scheduleData)}
                      {scheduleData.mode === 'custom' ? '；选择上方常用频率后可改为新的执行计划。' : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 右栏：目标配置 */}
            <div className="space-y-5">
              <div className="space-y-4">
                <h3 className="text-base font-medium flex items-center gap-2 text-foreground pb-2 border-b border-border">
                  <Settings className="w-4 h-4 text-green-600" />
                  目标配置
                </h3>
                
                {/* 目标设备 */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    目标设备 <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">({formData.devices.length} 个)</span>
                  </label>
                  <div className={`border rounded-lg overflow-hidden ${
                    errors.devices ? 'border-red-500' : 'border-border'
                  }`}>
                    {/* 已选设备 */}
                    <div className="p-3 bg-muted/40 dark:bg-gray-700/50 min-h-[60px]">
                      {formData.devices.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.devices.map((deviceId) => (
                            <Badge key={deviceId} variant="secondary" className="flex items-center gap-1">
                              {getDeviceName(deviceId)}
                              <button
                                type="button"
                                onClick={() => toggleDevice(deviceId)}
                                className="ml-1 hover:text-red-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">请从下方列表选择设备</p>
                      )}
                    </div>
                    
                    {/* 设备选择器 */}
                    <div className="border-t dark:border-gray-600">
                      <div className="p-2 border-b dark:border-gray-600">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={deviceSearch}
                            onChange={(e) => setDeviceSearch(e.target.value)}
                            placeholder="搜索设备..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                          />
                        </div>
                      </div>
                      <div className="max-h-[120px] overflow-y-auto">
                        {devicesLoading ? (
                          <p className="p-3 text-sm text-gray-500">加载中...</p>
                        ) : filteredDevices.length > 0 ? (
                          filteredDevices.map((device) => (
                            <label
                              key={device.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.devices.includes(device.id)}
                                onChange={() => toggleDevice(device.id)}
                                className="rounded border-border text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-muted-foreground flex-1">
                                {device.name}
                              </span>
                              <span className="text-xs text-gray-400">{device.ip}</span>
                            </label>
                          ))
                        ) : (
                          <p className="p-3 text-sm text-gray-500">暂无设备</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {errors.devices && <p className="text-xs text-red-500 mt-1">{errors.devices}</p>}
                </div>

                {/* 巡检模板 */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    巡检模板 <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">({formData.templates.length} 个)</span>
                  </label>
                  <div className={`border rounded-lg overflow-hidden ${
                    errors.templates ? 'border-red-500' : 'border-border'
                  }`}>
                    {/* 已选模板 */}
                    <div className="p-3 bg-muted/40 dark:bg-gray-700/50 min-h-[60px]">
                      {formData.templates.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.templates.map((templateId) => (
                            <Badge key={templateId} variant="primary" className="flex items-center gap-1">
                              {getTemplateName(templateId)}
                              <button
                                type="button"
                                onClick={() => toggleTemplate(templateId)}
                                className="ml-1 hover:text-red-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">请从下方列表选择模板</p>
                      )}
                    </div>
                    
                    {/* 模板选择器 */}
                    <div className="border-t dark:border-gray-600">
                      <div className="p-2 border-b dark:border-gray-600">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                            placeholder="搜索模板..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                          />
                        </div>
                      </div>
                      <div className="max-h-[120px] overflow-y-auto">
                        {templatesLoading ? (
                          <p className="p-3 text-sm text-gray-500">加载中...</p>
                        ) : filteredTemplates.length > 0 ? (
                          filteredTemplates.map((template) => (
                            <label
                              key={template.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="inspection-template"
                                checked={formData.templates.includes(Number(template.id))}
                                onChange={() => toggleTemplate(Number(template.id))}
                                className="rounded border-border text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-muted-foreground flex-1">
                                {template.name}
                              </span>
                              {template.isBuiltIn && (
                                <Badge variant="success" size="sm">内置</Badge>
                              )}
                            </label>
                          ))
                        ) : (
                          <p className="p-3 text-sm text-gray-500">暂无模板</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {errors.templates && <p className="text-xs text-red-500 mt-1">{errors.templates}</p>}
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-gray-700 bg-muted/40/50">
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
