/**
 * 屏蔽关键字的切分与匹配。
 *
 * 规则与后端 internal/common/keyword_filter.go 逐条对齐，前端用它在列表与 WebSocket 事件层
 * 判定"这条告警/日志是噪声"（同时覆盖原始字段与人话翻译字段），后端用同一规则做 SQL 过滤，两边口径一致。
 */

import {
  describeFacility,
  humanizeAlertCategory,
  translateToPlainLanguage,
} from '@/lib/plain-language'

export const MAX_EXCLUDE_KEYWORDS = 20

const SEPARATOR = /[,，;；]/

export interface AlertExcludeTarget {
  title?: unknown
  description?: unknown
  message?: unknown
  device?: unknown
  severity?: unknown
  category?: unknown
}

export interface LogExcludeTarget {
  message?: unknown
  raw_message?: unknown
  device_name?: unknown
  device_ip?: unknown
  source_process?: unknown
  level?: unknown
  facility?: unknown
}

/**
 * 按英文/中文逗号与分号切分：去空白、按小写去重（保留首次出现的原样）、截断至上限。
 * 空输入或只有分隔符时返回空数组。
 */
export function splitExcludeKeywords(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of raw.split(SEPARATOR)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(trimmed)
    if (result.length >= MAX_EXCLUDE_KEYWORDS) break
  }
  return result
}

/**
 * 任一字段（字符串或数字）以大小写不敏感方式包含任一关键字即命中；其余类型字段跳过。
 */
export function matchesExcludeKeywords(
  fields: ReadonlyArray<unknown>,
  keywords: ReadonlyArray<string>,
): boolean {
  if (keywords.length === 0) return false
  const lowered = keywords.map((k) => k.toLowerCase())
  for (const field of fields) {
    if (typeof field !== 'string' && typeof field !== 'number') continue
    const haystack = String(field).toLowerCase()
    if (lowered.some((k) => k !== '' && haystack.includes(k))) return true
  }
  return false
}

/**
 * 判定告警是否命中屏蔽关键字：同时匹配原始字段与前端人话翻译（标题、摘要、处置建议、OID 释义、分类中文名），
 * 解决设备上报英文原文而界面展示中文翻译时，用户按界面所见中文词屏蔽不生效的问题。
 */
export function matchesAlertExcludeKeywords(
  target: AlertExcludeTarget,
  keywords: ReadonlyArray<string>,
): boolean {
  if (keywords.length === 0) return false
  const message =
    typeof target.description === 'string' && target.description
      ? target.description
      : typeof target.message === 'string'
        ? target.message
        : ''
  const title = typeof target.title === 'string' ? target.title : undefined
  const level = typeof target.severity === 'string' ? target.severity : undefined
  const facility = typeof target.category === 'string' ? target.category : undefined
  const deviceName = typeof target.device === 'string' ? target.device : undefined
  const categoryLabel = facility ? humanizeAlertCategory(facility) : undefined
  const plain = translateToPlainLanguage({
    message,
    title,
    level,
    facility,
    deviceName,
  })

  return matchesExcludeKeywords(
    [
      target.title,
      target.description,
      target.message,
      target.device,
      target.category,
      categoryLabel,
      plain.title,
      plain.summary,
      plain.trap?.name,
      plain.trap?.label,
      plain.trap?.detail,
    ],
    keywords,
  )
}

/**
 * 判定日志是否命中屏蔽关键字：同时匹配原始字段与前端人话翻译结果。
 */
export function matchesLogExcludeKeywords(
  target: LogExcludeTarget,
  keywords: ReadonlyArray<string>,
): boolean {
  if (keywords.length === 0) return false
  const message = typeof target.message === 'string' ? target.message : ''
  const level = typeof target.level === 'string' ? target.level : undefined
  const facility = typeof target.facility === 'string' ? target.facility : undefined
  const deviceName = typeof target.device_name === 'string' ? target.device_name : undefined
  const facilityLabel = facility ? describeFacility(facility) : undefined
  const plain = translateToPlainLanguage({
    message,
    level,
    facility,
    deviceName,
  })

  return matchesExcludeKeywords(
    [
      target.message,
      target.raw_message,
      target.device_name,
      target.device_ip,
      target.source_process,
      target.facility,
      facilityLabel,
      plain.title,
      plain.summary,
      plain.trap?.name,
      plain.trap?.label,
      plain.trap?.detail,
    ],
    keywords,
  )
}
