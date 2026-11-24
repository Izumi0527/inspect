import type { MonitoringDataV2, SystemPerformanceDataPoint } from '../types'
import type {
  ActiveProblemItem,
  AggregateTrendPoint,
  DashboardAnnotation,
  GroupSummaryItem,
  HealthDistributionBuckets,
  NotificationChannelReadiness,
  ThresholdSummary,
} from '../types/zabbix-monitoring.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toNum = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toStr = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback

function normalizeThresholds(raw: unknown): ThresholdSummary | undefined {
  if (!isRecord(raw)) return undefined
  const parsePair = (pair: unknown, defWarn: number, defCrit: number) => {
    if (!isRecord(pair)) return { warn: defWarn, crit: defCrit }
    return {
      warn: toNum(pair.warn, defWarn),
      crit: toNum(pair.crit, defCrit),
    }
  }
  return {
    cpu: parsePair(raw.cpu, 80, 90),
    memory: parsePair(raw.memory, 80, 90),
    temperature: parsePair(raw.temperature, 70, 85),
  }
}

function normalizeHealthDistribution(raw: unknown): HealthDistributionBuckets | undefined {
  if (!isRecord(raw)) return undefined
  return {
    normal: toNum(raw.normal, 0),
    elevated: toNum(raw.elevated, 0),
    overloaded: toNum(raw.overloaded, 0),
    offline: toNum(raw.offline, 0),
    maintenance: toNum(raw.maintenance, 0),
  }
}

function normalizeGroupSummaries(raw: unknown): GroupSummaryItem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(isRecord).map((item) => ({
    group_id: toNum(item.group_id, 0),
    group_name: toStr(item.group_name, '未分组'),
    total_devices: toNum(item.total_devices, 0),
    online_devices: toNum(item.online_devices, 0),
    offline_devices: toNum(item.offline_devices, 0),
    warning_devices: toNum(item.warning_devices, 0),
    max_cpu: toNum(item.max_cpu, 0),
    max_memory: toNum(item.max_memory, 0),
  }))
}

function normalizeAggregateTrends(raw: unknown): AggregateTrendPoint[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(isRecord).map((item) => ({
    timestamp: toStr(item.timestamp, new Date().toISOString()),
    mean_cpu: toNum(item.mean_cpu, 0),
    p95_cpu: toNum(item.p95_cpu, 0),
    max_cpu: toNum(item.max_cpu, 0),
    mean_memory: toNum(item.mean_memory, 0),
    p95_memory: toNum(item.p95_memory, 0),
    max_memory: toNum(item.max_memory, 0),
    peak_device_id: typeof item.peak_device_id === 'number' ? item.peak_device_id : undefined,
    peak_device_name: typeof item.peak_device_name === 'string' ? item.peak_device_name : undefined,
    peak_memory_device_id:
      typeof item.peak_memory_device_id === 'number' ? item.peak_memory_device_id : undefined,
    peak_memory_device_name:
      typeof item.peak_memory_device_name === 'string' ? item.peak_memory_device_name : undefined,
  }))
}

function normalizeAnnotations(raw: unknown): DashboardAnnotation[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(isRecord).map((item) => {
    const typeRaw = toStr(item.type, 'alert')
    const type: DashboardAnnotation['type'] =
      typeRaw === 'reboot' || typeRaw === 'maintenance' ? typeRaw : 'alert'
    return {
      timestamp: toStr(item.timestamp, new Date().toISOString()),
      type,
      title: toStr(item.title),
      severity: typeof item.severity === 'string' ? item.severity : undefined,
      device_id: typeof item.device_id === 'number' ? item.device_id : undefined,
      device_name: typeof item.device_name === 'string' ? item.device_name : undefined,
    }
  })
}

function normalizeNotificationChannels(
  raw: unknown
): NotificationChannelReadiness[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(isRecord).map((item) => ({
    channel: toStr(item.channel),
    enabled: item.enabled === true,
    configured: item.configured === true,
  }))
}

function normalizeActiveProblems(raw: unknown): ActiveProblemItem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(isRecord).map((item) => ({
    alert_id: toNum(item.alert_id, 0),
    device_id: toNum(item.device_id, 0),
    device_name: toStr(item.device_name),
    title: toStr(item.title),
    severity: toStr(item.severity, 'warning'),
    status: toStr(item.status, 'open'),
    metric_name: typeof item.metric_name === 'string' ? item.metric_name : undefined,
    current_value: typeof item.current_value === 'number' ? item.current_value : undefined,
    threshold_value:
      typeof item.threshold_value === 'number' ? item.threshold_value : undefined,
    last_occurred: typeof item.last_occurred === 'string' ? item.last_occurred : undefined,
    snoozed_until: typeof item.snoozed_until === 'string' ? item.snoozed_until : undefined,
    suppressed_by:
      typeof item.suppressed_by === 'string' && item.suppressed_by.trim()
        ? item.suppressed_by.trim()
        : undefined,
    snooze_reason:
      typeof item.snooze_reason === 'string' && item.snooze_reason.trim()
        ? item.snooze_reason.trim()
        : undefined,
  }))
}

export function extractDashboardV2Enrichment(
  raw: Record<string, unknown>,
  normalizePerf: (value: unknown) => SystemPerformanceDataPoint[]
): Partial<MonitoringDataV2> {
  const out: Partial<MonitoringDataV2> = {}

  const thresholds = normalizeThresholds(raw.thresholds)
  if (thresholds) out.thresholds = thresholds

  const healthDistribution = normalizeHealthDistribution(raw.healthDistribution)
  if (healthDistribution) out.healthDistribution = healthDistribution

  const groupSummaries = normalizeGroupSummaries(raw.groupSummaries)
  if (groupSummaries) out.groupSummaries = groupSummaries

  const aggregateTrends = normalizeAggregateTrends(raw.aggregateTrends)
  if (aggregateTrends) out.aggregateTrends = aggregateTrends

  if (Array.isArray(raw.yesterdayBaseline)) {
    out.yesterdayBaseline = normalizePerf(raw.yesterdayBaseline)
  }

  const annotations = normalizeAnnotations(raw.annotations)
  if (annotations) out.annotations = annotations

  const notificationChannelSummary = normalizeNotificationChannels(
    raw.notificationChannelSummary
  )
  if (notificationChannelSummary) {
    out.notificationChannelSummary = notificationChannelSummary
  }

  const activeProblems = normalizeActiveProblems(raw.activeProblems)
  if (activeProblems) out.activeProblems = activeProblems

  return out
}
