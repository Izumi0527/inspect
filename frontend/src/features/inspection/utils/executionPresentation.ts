/**
 * 执行历史与执行详情的纯展示工具函数。
 * 统一状态语义映射、设备状态中文映射、耗时格式化与评分等级计算。
 */

export type ExecutionBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export interface ExecutionStatusOption {
  value: 'all' | 'running' | 'completed' | 'failed' | 'cancelled'
  label: string
}

export const EXECUTION_STATUS_OPTIONS: readonly ExecutionStatusOption[] = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
] as const

export interface ExecutionStatusMeta {
  label: string
  badgeVariant: ExecutionBadgeVariant
  progressBarClass: string
  iconSurfaceClass: string
}

export interface DeviceStatusMeta {
  label: string
  badgeVariant: ExecutionBadgeVariant
}

export interface ExecutionScoreMeta {
  hasScore: boolean
  display: string
  colorClass: string
  gradeLabel: string
}

export interface TriggerMeta {
  label: string
  isScheduled: boolean
}

/**
 * 格式化执行耗时（秒），统一处理 0 秒、浮点进位与非法值。
 */
export function formatExecutionDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '-'
  }
  const rounded = Math.round(seconds)
  if (rounded === 0) {
    return '<1秒'
  }
  if (rounded < 60) {
    return `${rounded}秒`
  }
  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60)
    const remain = rounded % 60
    return remain === 0 ? `${minutes}分` : `${minutes}分${remain}秒`
  }
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  return `${hours}小时${minutes}分`
}

/**
 * 将执行进度百分比钳制到 0..100 的整数区间。
 */
export function clampProgress(progress: number | undefined): number {
  if (progress === undefined || progress === null || !Number.isFinite(progress)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(progress)))
}

/**
 * 获取执行记录状态对应的标签、徽标变体及语义样式类。
 */
export function getExecutionStatusMeta(status: string): ExecutionStatusMeta {
  switch (status) {
    case 'running':
      return {
        label: '执行中',
        badgeVariant: 'info',
        progressBarClass: 'bg-primary',
        iconSurfaceClass: 'bg-info-soft text-info-soft-foreground',
      }
    case 'completed':
      return {
        label: '已完成',
        badgeVariant: 'success',
        progressBarClass: 'bg-success/80',
        iconSurfaceClass: 'bg-success-soft text-success-soft-foreground',
      }
    case 'failed':
      return {
        label: '失败',
        badgeVariant: 'error',
        progressBarClass: 'bg-danger',
        iconSurfaceClass: 'bg-danger-soft text-danger-soft-foreground',
      }
    case 'cancelled':
      return {
        label: '已取消',
        badgeVariant: 'neutral',
        progressBarClass: 'bg-muted-foreground/40',
        iconSurfaceClass: 'bg-unknown-soft text-unknown-soft-foreground',
      }
    default:
      return {
        label: '等待中',
        badgeVariant: 'warning',
        progressBarClass: 'bg-warning',
        iconSurfaceClass: 'bg-warning-soft text-warning-soft-foreground',
      }
  }
}

/**
 * 获取设备巡检状态对应的中文标签与语义徽标变体。
 */
export function getDeviceStatusMeta(status: string): DeviceStatusMeta {
  switch (status) {
    case 'success':
      return { label: '正常', badgeVariant: 'success' }
    case 'warning':
      return { label: '警告', badgeVariant: 'warning' }
    case 'error':
      return { label: '异常', badgeVariant: 'error' }
    case 'offline':
      return { label: '离线', badgeVariant: 'neutral' }
    default:
      return { label: status || '未知', badgeVariant: 'neutral' }
  }
}

/**
 * 计算巡检评分展示文本、语义色与等级说明。
 * 当任务尚处于执行中或等待中且尚无检查项汇总时返回空态占位。
 */
export function getExecutionScoreMeta(
  score: number,
  status?: string,
  totalChecks?: number
): ExecutionScoreMeta {
  if ((status === 'running' || status === 'pending') && (!totalChecks || totalChecks <= 0)) {
    return {
      hasScore: false,
      display: '—',
      colorClass: 'text-muted-foreground',
      gradeLabel: '巡检中',
    }
  }

  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
  if (safeScore >= 90) {
    return {
      hasScore: true,
      display: safeScore.toFixed(1),
      colorClass: 'text-success',
      gradeLabel: '优秀',
    }
  }
  if (safeScore >= 70) {
    return {
      hasScore: true,
      display: safeScore.toFixed(1),
      colorClass: 'text-warning',
      gradeLabel: '良好',
    }
  }
  return {
    hasScore: true,
    display: safeScore.toFixed(1),
    colorClass: 'text-danger',
    gradeLabel: '需要改进',
  }
}

/**
 * 获取触发类型展示元数据。
 */
export function getTriggerMeta(triggerType: string): TriggerMeta {
  if (triggerType === 'scheduled') {
    return { label: '定时触发', isScheduled: true }
  }
  return { label: '手动触发', isScheduled: false }
}

/**
 * 格式化状态筛选芯片文案。
 */
export function formatStatusFilterLabel(status: string): string {
  const matched = EXECUTION_STATUS_OPTIONS.find((item) => item.value === status)
  return matched ? `状态: ${matched.label}` : `状态: ${status}`
}

/**
 * 格式化日期范围筛选芯片文案。
 */
export function formatDateRangeFilterLabel(startDate: string, endDate: string): string {
  if (startDate && endDate) {
    return startDate === endDate ? `日期: ${startDate}` : `日期: ${startDate} ~ ${endDate}`
  }
  if (startDate) {
    return `日期: ${startDate} 起`
  }
  if (endDate) {
    return `日期: 截至 ${endDate}`
  }
  return ''
}

export interface NormalizedExecutionSummary<TDevice = unknown> {
  totalChecks: number
  passedChecks: number
  failedChecks: number
  warningChecks: number
  score: number
  deviceResults: TDevice[]
}

/**
 * 规范化执行汇总对象，防止缓存局部更新或异常载荷缺少 summary 时触发空引用崩溃。
 */
export function normalizeExecutionSummary<TDevice>(
  summary?: {
    totalChecks?: number
    passedChecks?: number
    failedChecks?: number
    warningChecks?: number
    score?: number
    deviceResults?: TDevice[]
  } | null
): NormalizedExecutionSummary<TDevice> {
  const safeCount = (val: number | undefined): number =>
    typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0

  return {
    totalChecks: safeCount(summary?.totalChecks),
    passedChecks: safeCount(summary?.passedChecks),
    failedChecks: safeCount(summary?.failedChecks),
    warningChecks: safeCount(summary?.warningChecks),
    score: typeof summary?.score === 'number' && Number.isFinite(summary.score) ? summary.score : 0,
    deviceResults: Array.isArray(summary?.deviceResults) ? summary.deviceResults : [],
  }
}

/**
 * 格式化单台设备巡检得分，屏蔽 NaN 或缺失值。
 */
export function formatDeviceScore(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '—'
  }
  return Math.max(0, Math.min(100, score)).toFixed(1)
}

