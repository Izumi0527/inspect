import { z } from 'zod'
import type { MaintenanceView } from '../../types/zabbix-monitoring.types'

export type MaintenanceLifecycleStatus = 'active' | 'pending' | 'ended' | 'disabled'

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

interface ZonedDateParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const safeTimeZone = timeZone?.trim() || 'Asia/Shanghai'
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      hour12: false,
    })
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      hour12: false,
    })
  }

  const map: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      map[part.type] = part.value
    }
  }
  const rawHour = map.hour ?? '00'
  // 部分 ICU 运行时在午夜 0 点会输出 "24"，统一规范为 "00"
  const hour = rawHour === '24' ? '00' : rawHour.padStart(2, '0')
  return {
    year: (map.year ?? '1970').padStart(4, '0'),
    month: (map.month ?? '01').padStart(2, '0'),
    day: (map.day ?? '01').padStart(2, '0'),
    hour,
    minute: (map.minute ?? '00').padStart(2, '0'),
    second: (map.second ?? '00').padStart(2, '0'),
  }
}

/**
 * 将 ISO 时间字符串按指定 IANA 时区格式化为 `YYYY-MM-DD HH:mm`。
 */
export function formatIsoInTimezone(iso: string, timeZone: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 16).replace('T', ' ')
  }
  const parts = getZonedDateParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

/**
 * 将 `datetime-local` 墙钟值按所选 IANA 时区精确换算为 UTC ISO 字符串。
 */
export function datetimeLocalToIsoInTimezone(localValue: string, timeZone: string): string {
  const trimmed = (localValue ?? '').trim()
  if (!trimmed) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed)
  if (!match) {
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = match[6] ? Number(match[6]) : 0

  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second)
  const tz = timeZone?.trim() || 'Asia/Shanghai'

  let guessMs = targetUtcMs
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedDateParts(new Date(guessMs), tz)
    const shownAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
    const diff = targetUtcMs - shownAsUtcMs
    if (diff === 0) break
    guessMs += diff
  }

  return new Date(guessMs).toISOString()
}

export function getMaintenanceLifecycleStatus(
  window: MaintenanceView,
  nowMs = Date.now()
): MaintenanceLifecycleStatus {
  if (!window.enabled) return 'disabled'
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
    const start = formatIsoInTimezone(window.start_time, tz)
    const end = formatIsoInTimezone(window.end_time, tz)
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

export function toDatetimeLocalValue(iso?: string, timeZone?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (timeZone) {
    const parts = getZonedDateParts(date, timeZone)
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const maintenanceFormSchema = z
  .object({
    name: z.string().trim().min(1, '请填写维护窗口名称').max(128, '名称不超过 128 字符'),
    description: z.string().trim().max(256, '维护说明不超过 256 字符').default(''),
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
      const tz = val.timezone || 'Asia/Shanghai'
      const startIso = datetimeLocalToIsoInTimezone(val.start_time, tz)
      const endIso = datetimeLocalToIsoInTimezone(val.end_time, tz)
      const s = startIso ? new Date(startIso).getTime() : Number.NaN
      const e = endIso ? new Date(endIso).getTime() : Number.NaN
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
