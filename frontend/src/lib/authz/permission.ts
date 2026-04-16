/**
 * 权限 key 归一化工具（前端防御性适配）
 *
 * 目标：
 * - 兼容历史权限 key（例如 alert:read -> alerts:read）
 * - 兼容动作别名（view/list -> read）
 * - 对大小写与空格鲁棒
 *
 * 注意：对于不符合 "<module>:<action>" 格式的输入，将保守原样返回（仅做 trim/lower）。
 */

export function normalizePermissionKey(raw: string): string {
  const trimmed = String(raw ?? '').toLowerCase().trim()
  if (trimmed === '') return ''

  const parts = trimmed.split(':')
  if (parts.length !== 2) return trimmed

  let resourceModule = parts[0].trim()
  let action = parts[1].trim()
  if (!resourceModule || !action) return trimmed

  // 模块名兼容映射（历史版本可能使用单数形式）
  switch (resourceModule) {
    case 'user':
      resourceModule = 'users'
      break
    case 'device':
      resourceModule = 'devices'
      break
    case 'inspection':
      resourceModule = 'inspections'
      break
    case 'alert':
      resourceModule = 'alerts'
      break
    case 'report':
      resourceModule = 'reports'
      break
    default:
      break
  }

  // 动作兼容映射
  switch (action) {
    case 'view':
    case 'list':
      action = 'read'
      break
    default:
      break
  }

  return `${resourceModule}:${action}`
}

export function normalizePermissionList(raw: Array<string>): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return []

  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const key = normalizePermissionKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function hasPermission(required: string, granted: Array<string>): boolean {
  const need = normalizePermissionKey(required)
  if (need === '') return true

  for (const item of granted ?? []) {
    if (normalizePermissionKey(item) === need) {
      return true
    }
  }
  return false
}
