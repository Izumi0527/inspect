import type {
  AdhocSeriesData,
  LatestDataItem,
} from '../../types/zabbix-monitoring.types'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'
import { isSyntheticInterfaceKey } from '../hosts/hostDisplayHelpers'

export const COMPARISON_PALETTE: readonly string[] = [
  ...DEVICE_SERIES_COLORS,
  '#8B5CF6',
]

export const APPLICATION_TAG_OPTIONS: ReadonlyArray<{
  value: string
  label: string
}> = [
  { value: '', label: '全部分类' },
  { value: 'system', label: '系统性能' },
  { value: 'interface', label: '网络接口' },
  { value: 'availability', label: '连通性' },
  { value: 'hardware', label: '环境与硬件' },
  { value: 'network', label: '协议与路由' },
]

export function getApplicationTagLabel(tag: string): string {
  const found = APPLICATION_TAG_OPTIONS.find((opt) => opt.value === tag)
  if (found) return found.label
  return tag || '自定义'
}

export function formatMetricDelta(delta: number | null, unit?: string): string {
  if (delta === null || !Number.isFinite(delta)) return '—'
  if (delta === 0) return '无变化'
  const sign = delta > 0 ? '+' : ''
  const val = Number.isInteger(delta) ? String(delta) : delta.toFixed(2)
  return unit ? `${sign}${val} ${unit}` : `${sign}${val}`
}

export function resolveLatestDataPortLabel(
  item: Pick<LatestDataItem, 'interface_name' | 'interface_display_name'>
): string {
  const displayName = item.interface_display_name?.trim()
  if (displayName) return displayName
  const ifaceName = item.interface_name?.trim()
  if (!ifaceName) return '整机'
  if (!isSyntheticInterfaceKey(ifaceName)) return ifaceName
  return '—'
}

export function resolveLatestDataDeltaDisplay(
  item: Pick<LatestDataItem, 'delta' | 'delta_display' | 'metric_unit'>
): string {
  const deltaDisplay = item.delta_display?.trim()
  if (deltaDisplay) return deltaDisplay
  return formatMetricDelta(item.delta, item.metric_unit)
}

export function getLatestDataDeltaToneClass(
  item: Pick<LatestDataItem, 'delta' | 'is_abnormal' | 'metric_name'>
): string {
  if (item.delta === null || !Number.isFinite(item.delta) || item.delta === 0) {
    return 'text-muted-foreground'
  }
  if (item.is_abnormal && item.delta > 0) {
    return 'font-medium text-danger'
  }
  return 'text-foreground'
}

const NON_TRAFFIC_PORT_PATTERN =
  /^(console|aux|inloopback|loopback|lo|null|meth|m-gigabitethernet|mgmt|management)($|[0-9/\-\s])/i

export function isNonTrafficPortName(portName?: string): boolean {
  const trimmed = (portName ?? '').trim()
  if (!trimmed) return false
  return NON_TRAFFIC_PORT_PATTERN.test(trimmed)
}

function compareNaturalStrings(left: string, right: string): number {
  const leftParts = left.split(/(\d+)/)
  const rightParts = right.split(/(\d+)/)
  const len = Math.max(leftParts.length, rightParts.length)

  for (let i = 0; i < len; i += 1) {
    const a = leftParts[i] ?? ''
    const b = rightParts[i] ?? ''
    if (a === b) continue

    const aIsNum = /^\d+$/.test(a)
    const bIsNum = /^\d+$/.test(b)
    if (aIsNum && bIsNum) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff
      if (a.length !== b.length) return a.length - b.length
      continue
    }

    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    if (aLower !== bLower) {
      return aLower < bLower ? -1 : 1
    }
  }
  return 0
}

export function compareLatestDataItemsNaturally(
  a: Pick<LatestDataItem, 'interface_name' | 'interface_display_name' | 'metric_name'> & {
    device_id?: number
  },
  b: Pick<LatestDataItem, 'interface_name' | 'interface_display_name' | 'metric_name'> & {
    device_id?: number
  }
): number {
  const aIsHost = a.interface_name.trim() === ''
  const bIsHost = b.interface_name.trim() === ''
  if (aIsHost !== bIsHost) {
    return aIsHost ? -1 : 1
  }

  if (a.device_id !== undefined && b.device_id !== undefined && a.device_id !== b.device_id) {
    return a.device_id - b.device_id
  }

  if (!aIsHost) {
    const portCmp = compareNaturalStrings(
      resolveLatestDataPortLabel(a),
      resolveLatestDataPortLabel(b)
    )
    if (portCmp !== 0) return portCmp
  }

  return a.metric_name.localeCompare(b.metric_name)
}

export interface NormalizedSeriesStats {
  min: number
  max: number
  span: number
}

export function computeSeriesBounds(
  values: ReadonlyArray<number | null>
): NormalizedSeriesStats {
  const valid = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  )
  if (valid.length === 0) {
    return { min: 0, max: 1, span: 1 }
  }
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const span = max - min
  return { min, max, span: span > 0 ? span : 1 }
}

export function normalizeValue(
  val: number | null,
  bounds: NormalizedSeriesStats
): number | null {
  if (val === null || !Number.isFinite(val)) return null
  if (bounds.max === bounds.min) return 50
  return ((val - bounds.min) / bounds.span) * 100
}

export function formatSeriesDisplayName(series: AdhocSeriesData): string {
  const portLabel = resolveLatestDataPortLabel({
    interface_name: series.interface_name ?? '',
    interface_display_name: series.interface_display_name,
  })
  const iface = portLabel !== '整机' && portLabel !== '—' ? ` (${portLabel})` : ''
  return `${series.device_name} · ${series.metric_label}${iface}`
}
