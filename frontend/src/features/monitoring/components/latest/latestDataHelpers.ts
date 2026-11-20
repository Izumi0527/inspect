import type { AdhocSeriesData } from '../../types/zabbix-monitoring.types'
import { DEVICE_SERIES_COLORS } from '../../utils/monitoring'

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
  const iface = series.interface_name ? ` (${series.interface_name})` : ''
  return `${series.device_name} · ${series.metric_label}${iface}`
}
