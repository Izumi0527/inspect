import type { ThresholdSummary, TopNItem, TopNMetric } from '../../types/zabbix-monitoring.types'
import { isSyntheticInterfaceKey } from '../hosts/hostDisplayHelpers'

export const DEFAULT_TOPN_THRESHOLDS: ThresholdSummary = {
  cpu: { warn: 80, crit: 90 },
  memory: { warn: 80, crit: 90 },
  temperature: { warn: 70, crit: 85 },
}

export type TopNBarSeverity = 'normal' | 'warning' | 'danger'

export interface TopNBarPresentation {
  widthPct: number
  barClassName: string
  severity: TopNBarSeverity
}

const SEVERITY_CLASS_MAP: Readonly<Record<TopNBarSeverity, string>> = {
  normal: 'bg-primary',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const TOPN_EMPTY_MESSAGES: Readonly<Record<TopNMetric, string>> = {
  cpu: '暂无 CPU 负载数据',
  memory: '暂无内存负载数据',
  temperature: '暂无温度采样数据',
  if_util: '暂无活跃流量接口负载数据',
  if_errors: '暂无端口错包记录',
  ping_rtt: '暂无延迟探测数据',
}

function toFiniteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function compactNumber(value: number, maxDecimals: number): string {
  const safe = toFiniteOrZero(value)
  const rounded = Number(safe.toFixed(maxDecimals))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function resolveThresholdPair(
  thresholds: ThresholdSummary | undefined,
  key: keyof ThresholdSummary
): { warn: number; crit: number } {
  const fallback = DEFAULT_TOPN_THRESHOLDS[key]
  const pair = thresholds?.[key]
  const warn = pair && Number.isFinite(pair.warn) ? pair.warn : fallback.warn
  const crit = pair && Number.isFinite(pair.crit) ? pair.crit : fallback.crit
  return { warn, crit }
}

function resolveSeverityByThresholds(
  value: number,
  warn: number,
  crit: number
): TopNBarSeverity {
  if (value >= crit) return 'danger'
  if (value >= warn) return 'warning'
  return 'normal'
}

export function resolveTopNInterfaceLabel(
  item: Pick<TopNItem, 'interface_name' | 'interface_display_name'>
): string {
  const displayName = item.interface_display_name?.trim()
  if (displayName) return displayName

  const rawName = item.interface_name?.trim() ?? ''
  if (rawName && !isSyntheticInterfaceKey(rawName)) {
    return rawName
  }
  return ''
}

export function formatTopNValue(
  metric: TopNMetric,
  item: Pick<TopNItem, 'value' | 'unit' | 'display_value'>
): string {
  const displayValue = item.display_value?.trim()
  if (displayValue) return displayValue

  const safeValue = toFiniteOrZero(item.value)
  switch (metric) {
    case 'cpu':
    case 'memory':
      return `${compactNumber(safeValue, 2)}%`
    case 'if_util':
      return safeValue > 0 && safeValue < 0.01 ? '< 0.01%' : `${compactNumber(safeValue, 2)}%`
    case 'temperature':
      return `${compactNumber(safeValue, 1)}°C`
    case 'ping_rtt':
      return safeValue > 0 && safeValue < 0.1 ? '< 0.1 ms' : `${compactNumber(safeValue, 1)} ms`
    case 'if_errors':
      return `${Math.round(safeValue)} 个`
  }
}

export function resolveTopNBarPresentation(
  metric: TopNMetric,
  value: number,
  maxValue: number,
  thresholds?: ThresholdSummary
): TopNBarPresentation {
  const safeValue = toFiniteOrZero(value)
  const safeMax = toFiniteOrZero(maxValue)

  let widthPct = 0
  let severity: TopNBarSeverity = 'normal'

  switch (metric) {
    case 'cpu': {
      const { warn, crit } = resolveThresholdPair(thresholds, 'cpu')
      widthPct = safeValue <= 0 ? 0 : clamp(Math.max(2, safeValue), 0, 100)
      severity = resolveSeverityByThresholds(safeValue, warn, crit)
      break
    }
    case 'memory': {
      const { warn, crit } = resolveThresholdPair(thresholds, 'memory')
      widthPct = safeValue <= 0 ? 0 : clamp(Math.max(2, safeValue), 0, 100)
      severity = resolveSeverityByThresholds(safeValue, warn, crit)
      break
    }
    case 'temperature': {
      const { warn, crit } = resolveThresholdPair(thresholds, 'temperature')
      const scaleMax = Math.max(100, crit * 1.15)
      widthPct = safeValue <= 0 ? 0 : clamp(Math.max(4, (safeValue / scaleMax) * 100), 0, 100)
      severity = resolveSeverityByThresholds(safeValue, warn, crit)
      break
    }
    case 'if_util': {
      widthPct = safeValue <= 0 ? 0 : clamp(Math.max(2, safeValue), 0, 100)
      severity = resolveSeverityByThresholds(safeValue, 65, 85)
      break
    }
    case 'if_errors': {
      widthPct =
        safeValue <= 0
          ? 0
          : clamp(Math.max(6, (safeValue / Math.max(1, safeMax)) * 100), 0, 100)
      severity = safeValue >= 100 ? 'danger' : safeValue > 0 ? 'warning' : 'normal'
      break
    }
    case 'ping_rtt': {
      const scaleMax = Math.max(100, safeMax)
      widthPct = safeValue <= 0 ? 0 : clamp(Math.max(4, (safeValue / scaleMax) * 100), 0, 100)
      severity = resolveSeverityByThresholds(safeValue, 50, 100)
      break
    }
  }

  return {
    widthPct,
    barClassName: SEVERITY_CLASS_MAP[severity],
    severity,
  }
}

export function getTopNEmptyMessage(metric: TopNMetric): string {
  return TOPN_EMPTY_MESSAGES[metric]
}
