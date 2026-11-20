/**
 * Dashboard v2 增量扩展与总览大屏强类型契约
 */

export type MonitoringTabKey =
  | 'overview'
  | 'hosts'
  | 'latest'
  | 'templates'
  | 'triggers'
  | 'maintenance'

export interface ThresholdPair {
  warn: number
  crit: number
}

export interface ThresholdSummary {
  cpu: ThresholdPair
  memory: ThresholdPair
  temperature: ThresholdPair
}

export interface HealthDistributionBuckets {
  normal: number
  elevated: number
  overloaded: number
  offline: number
  maintenance: number
}

export interface GroupSummaryItem {
  group_id: number
  group_name: string
  total_devices: number
  online_devices: number
  offline_devices: number
  warning_devices: number
  max_cpu: number
  max_memory: number
}

export interface AggregateTrendPoint {
  timestamp: string
  mean_cpu: number
  p95_cpu: number
  max_cpu: number
  mean_memory: number
  p95_memory: number
  max_memory: number
  peak_device_id?: number
  peak_device_name?: string
}

export type DashboardAnnotationType = 'alert' | 'reboot' | 'maintenance'

export interface DashboardAnnotation {
  timestamp: string
  type: DashboardAnnotationType
  title: string
  severity?: string
  device_id?: number
  device_name?: string
}

export interface NotificationChannelReadiness {
  channel: string
  enabled: boolean
  configured: boolean
}

export interface ActiveProblemItem {
  alert_id: number
  device_id: number
  device_name: string
  title: string
  severity: string
  status: string
  metric_name?: string
  current_value?: number
  threshold_value?: number
  last_occurred?: string
  snoozed_until?: string
}

export interface CollectDeviceMetricsResult {
  success: boolean
  device_id: number
  metrics_written: number
  interfaces_written: number
  collection_time_ms: number
}
