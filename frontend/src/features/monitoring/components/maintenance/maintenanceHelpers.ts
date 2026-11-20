import { z } from 'zod'
import type { MaintenanceView } from '../../types/zabbix-monitoring.types'

export type MaintenanceLifecycleStatus = 'active' | 'pending' | 'ended'

export const MAINTENANCE_MODE_META: Record<
  string,
  { label: string; description: string; badgeVariant: 'info' | 'warning' }
> = {
  collect_silence: {
    label: '仅静默告警·仍记录曲线',
    description: '割接期间照常采集指标与流量曲线，仅屏蔽重复告警通知（推荐）',
    badgeVariant: 'info',
  },
  pause_collection: {
    label: '完全暂停采集',
    description: '维护窗口期间彻底暂停向目标设备发起探活与指标采集',
    badgeVariant: 'warning',
  },
}

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  once: '一次性维护',
  weekly: '每周重复',
  monthly: '每月重复',
}

export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
]

export const TIMEZONE_OPTIONS: ReadonlyArray<string> = [
  'Asia/Shanghai',
  'UTC',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
]

export function getMaintenanceLifecycleStatus(
  window: MaintenanceView,
  nowMs = Date.now()
): MaintenanceLifecycleStatus {
  if (window.is_active) return 'active'
  if (window.schedule_type === 'once') {
    const endMs = new Date(window.end_time).getTime()
    if (Number.isFinite(endMs) && endMs <= nowMs) {
      return 'ended'
    }
  }
  return 'pending'
}

export function formatMaintenanceWindowSchedule(window: MaintenanceView): string {
  const tz = window.timezone || 'Asia/Shanghai'
  if (window.schedule_type === 'once') {
    const start = window.start_time.slice(0, 16).replace('T', ' ')
    const end = window.end_time.slice(0, 16).replace('T', ' ')
    return `${start} ~ ${end} (${tz})`
  }
  if (window.schedule_type === 'weekly') {
    const days = (window.recurrence?.weekdays ?? [])
      .map((d) => WEEKDAY_OPTIONS.find((opt) => opt.value === d)?.label ?? `周${d}`)
      .join('、')
    return `每${days || '周'} ${window.recurrence?.start_hm ?? '00:00'} ~ ${window.recurrence?.end_hm ?? '02:00'} (${tz})`
  }
  const doms = (window.recurrence?.days_of_month ?? []).map((d) => `${d}日`).join('、')
  return `每月 ${doms || '1日'} ${window.recurrence?.start_hm ?? '00:00'} ~ ${window.recurrence?.end_hm ?? '02:00'} (${tz})`
}

export function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const maintenanceFormSchema = z
  .object({
    name: z.string().trim().min(1, '请填写维护窗口名称').max(128, '名称不超过 128 字符'),
    description: z.string().trim().max(256).default(''),
    mode: z.enum(['collect_silence', 'pause_collection']),
    schedule_type: z.enum(['once', 'weekly', 'monthly']),
    timezone: z.string().trim().min(1).default('Asia/Shanghai'),
    start_time: z.string().default(''),
    end_time: z.string().default(''),
    start_hm: z.string().default('23:00'),
    end_hm: z.string().default('02:00'),
    enabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.schedule_type === 'once') {
      const s = new Date(val.start_time).getTime()
      const e = new Date(val.end_time).getTime()
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end_time'],
          message: '结束时间必须晚于开始时间',
        })
      }
    } else if (!val.start_hm || !val.end_hm || val.start_hm === val.end_hm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_hm'],
        message: '请设置有效的起止时段（结束时段不能与开始相同）',
      })
    }
  })

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>
