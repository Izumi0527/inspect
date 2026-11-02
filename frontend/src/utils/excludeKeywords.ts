/**
 * 屏蔽关键字的切分与匹配。
 *
 * 规则与后端 internal/common/keyword_filter.go 逐条对齐，前端用它在 WebSocket 事件层
 * 判定"这条告警是噪声"，后端用同一规则做 SQL 过滤，两边口径一致。
 */

export const MAX_EXCLUDE_KEYWORDS = 20

const SEPARATOR = /[,，;；]/

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
