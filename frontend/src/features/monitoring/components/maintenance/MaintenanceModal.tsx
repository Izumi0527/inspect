'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Button, Input } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import type { MaintenanceInput, MaintenanceView } from '../../types/zabbix-monitoring.types'
import { MaintenanceTargetsSection } from './MaintenanceTargetsSection'
import {
  MAINTENANCE_MODE_META,
  maintenanceFormSchema,
  TIMEZONE_OPTIONS,
  toDatetimeLocalValue,
  WEEKDAY_OPTIONS,
  type MaintenanceFormValues,
} from './maintenanceHelpers'

interface MaintenanceModalProps {
  open: boolean
  editingWindow: MaintenanceView | null
  submitting: boolean
  onClose: () => void
  onSubmit: (input: MaintenanceInput) => void
}

function getDefaults(win: MaintenanceView | null): MaintenanceFormValues {
  if (!win) {
    const now = new Date()
    const twoHoursLater = new Date(now.getTime() + 2 * 3600 * 1000)
    return {
      name: '',
      description: '',
      mode: 'collect_silence',
      schedule_type: 'once',
      timezone: 'Asia/Shanghai',
      start_time: toDatetimeLocalValue(now.toISOString()),
      end_time: toDatetimeLocalValue(twoHoursLater.toISOString()),
      start_hm: '23:00',
      end_hm: '02:00',
      enabled: true,
    }
  }
  return {
    name: win.name,
    description: win.description ?? '',
    mode: win.mode === 'pause_collection' ? 'pause_collection' : 'collect_silence',
    schedule_type:
      win.schedule_type === 'weekly' || win.schedule_type === 'monthly' ? win.schedule_type : 'once',
    timezone: win.timezone || 'Asia/Shanghai',
    start_time: toDatetimeLocalValue(win.start_time),
    end_time: toDatetimeLocalValue(win.end_time),
    start_hm: win.recurrence?.start_hm ?? '23:00',
    end_hm: win.recurrence?.end_hm ?? '02:00',
    enabled: win.enabled,
  }
}

export function MaintenanceModal({
  open,
  editingWindow,
  submitting,
  onClose,
  onSubmit,
}: MaintenanceModalProps) {
  const { data: groups = [] } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
  })
  const { data: devices = [] } = useMonitoringDevices()

  const [weekdays, setWeekdays] = useState<number[]>([6, 0])
  const [daysOfMonthText, setDaysOfMonthText] = useState('1,15')
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([])
  const [targetError, setTargetError] = useState<string | null>(null)

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: getDefaults(null),
  })
  const scheduleType = form.watch('schedule_type')
  const mode = form.watch('mode')

  useEffect(() => {
    if (!open) return
    form.reset(getDefaults(editingWindow))
    setWeekdays(editingWindow?.recurrence?.weekdays?.length ? editingWindow.recurrence.weekdays : [6, 0])
    setDaysOfMonthText(editingWindow?.recurrence?.days_of_month?.length ? editingWindow.recurrence.days_of_month.join(',') : '1,15')
    setSelectedGroupIds((editingWindow?.targets ?? []).filter((t) => t.target_type === 'device_group').map((t) => t.target_id))
    setSelectedDeviceIds((editingWindow?.targets ?? []).filter((t) => t.target_type === 'device').map((t) => t.target_id))
    setTargetError(null)
  }, [open, editingWindow, form])

  const handleFormSubmit = (values: MaintenanceFormValues) => {
    if (selectedGroupIds.length === 0 && selectedDeviceIds.length === 0) {
      setTargetError('请至少选择一个目标设备分组或指定设备')
      return
    }
    setTargetError(null)
    const daysOfMonth = daysOfMonthText
      .split(/[,，\s]+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)

    const payload: MaintenanceInput = {
      name: values.name.trim(),
      description: values.description.trim(),
      mode: values.mode,
      schedule_type: values.schedule_type,
      timezone: values.timezone,
      enabled: values.enabled,
      group_ids: selectedGroupIds,
      device_ids: selectedDeviceIds,
    }
    if (values.schedule_type === 'once') {
      payload.start_time = new Date(values.start_time).toISOString()
      payload.end_time = new Date(values.end_time).toISOString()
    } else if (values.schedule_type === 'weekly') {
      payload.recurrence = { weekdays: weekdays.length > 0 ? weekdays : [0], start_hm: values.start_hm, end_hm: values.end_hm }
    } else {
      payload.recurrence = { days_of_month: daysOfMonth.length > 0 ? daysOfMonth : [1], start_hm: values.start_hm, end_hm: values.end_hm }
    }
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingWindow ? '编辑计划维护窗口' : '新建计划维护窗口'}</DialogTitle>
          <DialogDescription>割接或设备升级期间开启免打扰窗口，不会永久关闭设备监控开关，到期后自动恢复。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="maint-name" className="mb-1 block text-xs font-medium text-foreground">维护窗口名称</label>
              <Input id="maint-name" {...form.register('name')} placeholder="例如：核心机房夜间光模块割接" />
              {form.formState.errors.name && <p className="mt-1 text-xs text-danger">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="maint-tz" className="mb-1 block text-xs font-medium text-foreground">执行时区</label>
              <Select
                value={String(form.watch('timezone') ?? 'Asia/Shanghai')}
                onValueChange={(val) => form.setValue('timezone', val, { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger id="maint-tz" aria-label="执行时区" className="h-9 w-full gap-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-foreground">维护模式</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(['collect_silence', 'pause_collection'] as const).map((key) => {
                const active = mode === key
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => form.setValue('mode', key)}
                    className={`rounded-lg border p-3 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent'}`}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {key === 'collect_silence' ? '仅静默告警（仍记录曲线，推荐）' : '完全暂停采集'}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{MAINTENANCE_MODE_META[key].description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="maint-schedule" className="mb-1 block text-xs font-medium text-foreground">执行周期</label>
              <Select
                value={String(form.watch('schedule_type') ?? 'once')}
                onValueChange={(val) =>
                  form.setValue('schedule_type', val as MaintenanceFormValues['schedule_type'], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="maint-schedule" aria-label="执行周期" className="h-9 w-full gap-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">一次性维护</SelectItem>
                  <SelectItem value="weekly">每周重复</SelectItem>
                  <SelectItem value="monthly">每月重复</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleType === 'once' ? (
              <>
                <div>
                  <label htmlFor="maint-start" className="mb-1 block text-xs font-medium text-foreground">开始时间</label>
                  <Input id="maint-start" type="datetime-local" className="tabular-nums" {...form.register('start_time')} />
                </div>
                <div>
                  <label htmlFor="maint-end" className="mb-1 block text-xs font-medium text-foreground">结束时间</label>
                  <Input id="maint-end" type="datetime-local" className="tabular-nums" {...form.register('end_time')} />
                  {form.formState.errors.end_time && <p className="mt-1 text-xs text-danger">{form.formState.errors.end_time.message}</p>}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="maint-hm-start" className="mb-1 block text-xs font-medium text-foreground">每日开始时段</label>
                  <Input id="maint-hm-start" type="time" className="tabular-nums" {...form.register('start_hm')} />
                </div>
                <div>
                  <label htmlFor="maint-hm-end" className="mb-1 block text-xs font-medium text-foreground">每日结束时段</label>
                  <Input id="maint-hm-end" type="time" className="tabular-nums" {...form.register('end_hm')} />
                  {form.formState.errors.end_hm && <p className="mt-1 text-xs text-danger">{form.formState.errors.end_hm.message}</p>}
                </div>
              </>
            )}
          </div>

          {scheduleType === 'weekly' && (
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((opt) => {
                const checked = weekdays.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => setWeekdays((prev) => checked ? prev.filter((d) => d !== opt.value) : [...prev, opt.value])}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {scheduleType === 'monthly' && (
            <div>
              <label htmlFor="maint-dom" className="mb-1 block text-xs font-medium text-foreground">每月执行日期（1~31，英文逗号分隔）</label>
              <Input id="maint-dom" value={daysOfMonthText} onChange={(e) => setDaysOfMonthText(e.target.value)} placeholder="1,15" className="tabular-nums" />
            </div>
          )}

          <MaintenanceTargetsSection
            groups={groups}
            devices={devices}
            selectedGroupIds={selectedGroupIds}
            selectedDeviceIds={selectedDeviceIds}
            errorMessage={targetError}
            onChangeGroups={setSelectedGroupIds}
            onChangeDevices={setSelectedDeviceIds}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" loading={submitting}>{editingWindow ? '保存维护窗口' : '创建维护窗口'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
