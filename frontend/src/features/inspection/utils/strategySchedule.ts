export type StrategyType = 'scheduled' | 'manual'
export type ScheduleMode = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'half_hourly' | 'custom'
export type WeekdayValue = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export interface ScheduleFormData {
  mode: ScheduleMode
  time: string
  weekday: WeekdayValue
  monthDay: string
}

export const DEFAULT_CRON = '0 0 2 * * ?'

export const DEFAULT_SCHEDULE: ScheduleFormData = {
  mode: 'daily',
  time: '02:00',
  weekday: 'MON',
  monthDay: '1',
}

export const scheduleModeOptions: Array<{ value: Exclude<ScheduleMode, 'custom'>; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'hourly', label: '每小时' },
  { value: 'half_hourly', label: '每30分钟' },
]

export const weekdayOptions: Array<{ value: WeekdayValue; label: string }> = [
  { value: 'MON', label: '周一' },
  { value: 'TUE', label: '周二' },
  { value: 'WED', label: '周三' },
  { value: 'THU', label: '周四' },
  { value: 'FRI', label: '周五' },
  { value: 'SAT', label: '周六' },
  { value: 'SUN', label: '周日' },
]

export const monthDayOptions = Array.from({ length: 28 }, (_, index) => {
  const day = String(index + 1)
  return { value: day, label: `${day}日` }
})

const FIVE_FIELD_WEEKDAY_MAP: Record<string, WeekdayValue> = {
  '0': 'SUN',
  '7': 'SUN',
  '1': 'MON',
  '2': 'TUE',
  '3': 'WED',
  '4': 'THU',
  '5': 'FRI',
  '6': 'SAT',
  SUN: 'SUN',
  MON: 'MON',
  TUE: 'TUE',
  WED: 'WED',
  THU: 'THU',
  FRI: 'FRI',
  SAT: 'SAT',
}

const isValidTime = (value: string): boolean => /^\d{2}:\d{2}$/.test(value)

const splitTime = (value: string) => {
  const [hour = '02', minute = '00'] = value.split(':')
  return {
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
  }
}

const formatHourMinute = (hourRaw: string, minuteRaw: string): string | null => {
  if (!/^\d{1,2}$/.test(hourRaw) || !/^\d{1,2}$/.test(minuteRaw)) {
    return null
  }
  const hour = Number.parseInt(hourRaw, 10)
  const minute = Number.parseInt(minuteRaw, 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const buildCronFromSchedule = (
  schedule: ScheduleFormData,
  fallbackCron: string
): string => {
  if (schedule.mode === 'custom') {
    return fallbackCron || DEFAULT_CRON
  }
  if (schedule.mode === 'hourly') {
    return '0 0 * * * ?'
  }
  if (schedule.mode === 'half_hourly') {
    return '0 */30 * * * ?'
  }

  if (!isValidTime(schedule.time)) {
    return ''
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

const parseSixFieldCron = (parts: string[]): ScheduleFormData => {
  if (parts[0] !== '0') {
    return { ...DEFAULT_SCHEDULE, mode: 'custom' }
  }

  const [, minute, hour, day, month, weekday] = parts
  const normalizedWeekday = weekday.toUpperCase()

  if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'hourly' }
  }
  if (minute === '*/30' && hour === '*' && day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'half_hourly' }
  }

  const time = formatHourMinute(hour, minute)
  if (!time) {
    return { ...DEFAULT_SCHEDULE, mode: 'custom' }
  }

  if (day === '*' && month === '*' && weekday === '?') {
    return { ...DEFAULT_SCHEDULE, mode: 'daily', time }
  }

  if (
    day === '?' &&
    month === '*' &&
    weekdayOptions.some((option) => option.value === normalizedWeekday)
  ) {
    return {
      ...DEFAULT_SCHEDULE,
      mode: 'weekly',
      time,
      weekday: normalizedWeekday as WeekdayValue,
    }
  }

  if (
    month === '*' &&
    weekday === '?' &&
    monthDayOptions.some((option) => option.value === day)
  ) {
    return { ...DEFAULT_SCHEDULE, mode: 'monthly', time, monthDay: day }
  }

  return { ...DEFAULT_SCHEDULE, mode: 'custom' }
}

const parseFiveFieldCron = (parts: string[]): ScheduleFormData => {
  const [minute, hour, day, month, weekday] = parts

  if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { ...DEFAULT_SCHEDULE, mode: 'hourly' }
  }
  if (minute === '*/30' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return { ...DEFAULT_SCHEDULE, mode: 'half_hourly' }
  }

  const time = formatHourMinute(hour, minute)
  if (!time) {
    return { ...DEFAULT_SCHEDULE, mode: 'custom' }
  }

  if (day === '*' && month === '*' && (weekday === '*' || weekday === '?')) {
    return { ...DEFAULT_SCHEDULE, mode: 'daily', time }
  }

  const mappedWeekday = FIVE_FIELD_WEEKDAY_MAP[weekday.toUpperCase()]
  if ((day === '*' || day === '?') && month === '*' && mappedWeekday) {
    return { ...DEFAULT_SCHEDULE, mode: 'weekly', time, weekday: mappedWeekday }
  }

  if (
    month === '*' &&
    (weekday === '*' || weekday === '?') &&
    monthDayOptions.some((option) => option.value === day)
  ) {
    return { ...DEFAULT_SCHEDULE, mode: 'monthly', time, monthDay: day }
  }

  return { ...DEFAULT_SCHEDULE, mode: 'custom' }
}

export const parseCronToSchedule = (cron?: string): ScheduleFormData => {
  const trimmed = cron?.trim()
  if (!trimmed) return DEFAULT_SCHEDULE

  const parts = trimmed.split(/\s+/)
  if (parts.length === 6) {
    return parseSixFieldCron(parts)
  }
  if (parts.length === 5) {
    return parseFiveFieldCron(parts)
  }

  return { ...DEFAULT_SCHEDULE, mode: 'custom' }
}

export const describeSchedule = (schedule: ScheduleFormData): string => {
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
  if (!isValidTime(schedule.time)) {
    return '请选择执行时刻'
  }
  if (schedule.mode === 'weekly') {
    return `每${weekday} ${schedule.time} 执行`
  }
  if (schedule.mode === 'monthly') {
    return `每月${monthDay} ${schedule.time} 执行`
  }
  return `每天 ${schedule.time} 执行`
}

export const describeCronExpression = (cron?: string): string => {
  if (!cron || !cron.trim()) {
    return '未配置周期'
  }

  const schedule = parseCronToSchedule(cron)
  const weekday = weekdayOptions.find((option) => option.value === schedule.weekday)?.label ?? '周一'
  const monthDay = monthDayOptions.find((option) => option.value === schedule.monthDay)?.label ?? '1日'

  switch (schedule.mode) {
    case 'hourly':
      return '每小时整点'
    case 'half_hourly':
      return '每 30 分钟'
    case 'daily':
      return `每天 ${schedule.time}`
    case 'weekly':
      return `每${weekday} ${schedule.time}`
    case 'monthly':
      return `每月 ${monthDay} ${schedule.time}`
    case 'custom':
    default:
      return '自定义计划'
  }
}

export const formatRelativeFutureTime = (
  isoTime?: string,
  now: Date = new Date()
): string | null => {
  if (!isoTime) return null
  const target = new Date(isoTime)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) {
    return '等待调度'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) {
    return '即将执行'
  }
  if (diffMinutes < 60) {
    return `约 ${diffMinutes} 分钟后`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `约 ${diffHours} 小时后`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `约 ${diffDays} 天后`
}
