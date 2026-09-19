/**
 * 日期筛选 → API 查询参数的边界转换
 *
 * 日期选择器产出 YYYY-MM-DD（本地自然日），后端按时间戳比较；
 * 直接透传会被当成 UTC 零点，导致结束日被截掉大半天、开始日在东八区提前 8 小时。
 * 这里把纯日期转换为本地当天 [00:00:00.000, 23:59:59.999] 的 ISO 时间。
 */

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 把 YYYY-MM-DD 转为本地当天零点（endOfDay=false）或末尾（endOfDay=true）的 ISO 字符串。
 * 非纯日期格式（如已是 ISO 时间）原样返回；空串或非法日期返回 null。
 */
export function toLocalDayBoundaryIso(value: string, endOfDay: boolean): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const match = DATE_ONLY_PATTERN.exec(raw)
  if (!match) return raw

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)

  // 2026-02-30 这类会被 Date 自动进位到 3 月，需回读校验
  const isValid =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  return isValid ? date.toISOString() : null
}
