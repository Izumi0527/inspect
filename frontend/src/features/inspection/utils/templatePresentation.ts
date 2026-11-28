import type { BadgeProps } from '@/components/atoms'
import type { InspectionCheckItem } from '../types'

export interface CategoryMeta {
  label: string
  badgeVariant: BadgeProps['variant']
}

export interface CheckTypeMeta {
  label: string
  shortLabel: string
  badgeVariant: BadgeProps['variant']
}

export interface CheckItemsSummary {
  total: number
  enabledCount: number
  disabledCount: number
  breakdownText: string
}

const CATEGORY_META_MAP: Record<string, CategoryMeta> = {
  network: { label: '网络监控', badgeVariant: 'info' },
  system: { label: '系统检查', badgeVariant: 'neutral' },
  security: { label: '安全检测', badgeVariant: 'warning' },
  custom: { label: '自定义', badgeVariant: 'secondary' },
}

const CHECK_TYPE_META_MAP: Record<string, CheckTypeMeta> = {
  snmp: { label: 'SNMP检查', shortLabel: 'SNMP', badgeVariant: 'info' },
  ping: { label: 'Ping测试', shortLabel: 'Ping', badgeVariant: 'success' },
  ssh: { label: 'SSH命令', shortLabel: 'SSH', badgeVariant: 'secondary' },
  http: { label: 'HTTP请求', shortLabel: 'HTTP', badgeVariant: 'neutral' },
  script: { label: '脚本执行', shortLabel: 'Script', badgeVariant: 'outline' },
}

const CHECK_TYPE_ORDER = ['snmp', 'ping', 'ssh', 'http', 'script'] as const

export const getCategoryMeta = (category?: string): CategoryMeta => {
  const key = category?.trim().toLowerCase() ?? ''
  if (key && key in CATEGORY_META_MAP) {
    return CATEGORY_META_MAP[key]
  }
  return {
    label: category?.trim() || '未分类',
    badgeVariant: 'outline',
  }
}

export const getCheckTypeMeta = (type?: string): CheckTypeMeta => {
  const key = type?.trim().toLowerCase() ?? ''
  if (key && key in CHECK_TYPE_META_MAP) {
    return CHECK_TYPE_META_MAP[key]
  }
  return {
    label: type?.trim() || '未知',
    shortLabel: type?.trim() || '未知',
    badgeVariant: 'outline',
  }
}

export const summarizeCheckItems = (
  items?: InspectionCheckItem[]
): CheckItemsSummary => {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      total: 0,
      enabledCount: 0,
      disabledCount: 0,
      breakdownText: '暂无检查项',
    }
  }

  let enabledCount = 0
  let disabledCount = 0
  const protocolCounts = new Map<string, number>()

  for (const item of items) {
    if (item.enabled === false) {
      disabledCount += 1
      continue
    }
    enabledCount += 1
    const key = (item.type ?? 'unknown').trim().toLowerCase() || 'unknown'
    protocolCounts.set(key, (protocolCounts.get(key) ?? 0) + 1)
  }

  const parts: string[] = []
  for (const orderedKey of CHECK_TYPE_ORDER) {
    const count = protocolCounts.get(orderedKey)
    if (count) {
      parts.push(`${getCheckTypeMeta(orderedKey).shortLabel} ${count}`)
      protocolCounts.delete(orderedKey)
    }
  }
  for (const [extraKey, count] of protocolCounts.entries()) {
    parts.push(`${getCheckTypeMeta(extraKey).shortLabel} ${count}`)
  }

  if (disabledCount > 0) {
    parts.push(`停用 ${disabledCount}`)
  }

  return {
    total: items.length,
    enabledCount,
    disabledCount,
    breakdownText: parts.join(' · ') || '暂无检查项',
  }
}
