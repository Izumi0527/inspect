/**
 * 告警规则、单条临时静默 (Snooze) 与计划维护窗口强类型契约
 */

export type TriggerExpressionMode =
  | 'threshold'
  | 'hysteresis'
  | 'nodata'
  | 'uptime_drop'
  | 'if_flap'

export type TriggerDependencyMode = 'none' | 'lldp_upstream' | 'manual_device'

export interface TriggerRule {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  is_active: boolean
  severity: string
  category: string
  metric_name: string
  operator: string
  condition: string
  threshold: number
  threshold_value: number
  duration: number
  device_types: string[]
  device_groups: number[]
  specific_devices: number[]
  auto_resolve?: boolean
  notification_enabled?: boolean
  notify_email: boolean
  notify_websocket: boolean
  email_enabled?: boolean
  webhook_enabled?: boolean
  webhook_url?: string | null
  email_recipients: string[]
  cooldown_minutes: number
  template_id?: number | null
  expression_mode: TriggerExpressionMode | string
  recovery_operator: string
  recovery_threshold?: number | null
  nodata_seconds: number
  dependency_mode: TriggerDependencyMode | string
  depends_on_device_id?: number | null
  entity_filter_regex: string
  tags_json: Record<string, unknown>
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface TriggerRuleInput {
  name: string
  description?: string
  severity: string
  category?: string
  metric_name: string
  operator?: string
  threshold_value: number
  duration?: number
  is_active?: boolean
  device_types?: string[]
  device_groups?: number[]
  specific_devices?: number[]
  auto_resolve?: boolean
  notification_enabled?: boolean
  email_enabled?: boolean
  webhook_enabled?: boolean
  cooldown_minutes?: number
  template_id?: number | null
  expression_mode?: TriggerExpressionMode | string
  recovery_operator?: string
  recovery_threshold?: number | null
  nodata_seconds?: number
  dependency_mode?: TriggerDependencyMode | string
  depends_on_device_id?: number | null
  entity_filter_regex?: string
  tags_json?: Record<string, unknown>
}

export type SnoozeDurationHours = 2 | 8 | 24

export interface SnoozeAlertRequest {
  duration_hours: SnoozeDurationHours
  reason: string
}

export interface SnoozeAlertResponse {
  success: boolean
  alert_id: string
  snoozed_until: string
  snoozed_by: string
  snooze_reason: string
}

export interface UnsnoozeAlertResponse {
  success: boolean
  alert_id: string
}

export type MaintenanceMode = 'collect_silence' | 'pause_collection'
export type MaintenanceScheduleType = 'once' | 'weekly' | 'monthly'
export type MaintenanceTargetType = 'device' | 'device_group'

export interface MaintenanceRecurrence {
  weekdays?: number[]
  days_of_month?: number[]
  start_hm?: string
  end_hm?: string
}

export interface MonitorMaintenanceTarget {
  id: number
  maintenance_id: number
  target_type: MaintenanceTargetType | string
  target_id: number
}

export interface MaintenanceTargetInput {
  target_type: MaintenanceTargetType | string
  target_id: number
}

export interface ActiveMaintenance {
  maintenance_id: number
  name: string
  mode: MaintenanceMode | string
  schedule_type: MaintenanceScheduleType | string
  timezone: string
  start_time: string
  end_time: string
  matched_target_type?: string
  matched_target_id?: number
}

export interface MaintenanceView {
  id: number
  name: string
  description: string
  mode: MaintenanceMode | string
  schedule_type: MaintenanceScheduleType | string
  start_time: string
  end_time: string
  recurrence_json?: MaintenanceRecurrence | string
  timezone: string
  enabled: boolean
  created_by: string
  created_at: string
  updated_at: string
  recurrence: MaintenanceRecurrence
  targets: MonitorMaintenanceTarget[]
  is_active: boolean
}

export interface MaintenanceInput {
  name: string
  description?: string
  mode: MaintenanceMode | string
  schedule_type: MaintenanceScheduleType | string
  start_time?: string
  end_time?: string
  recurrence?: MaintenanceRecurrence
  timezone?: string
  enabled?: boolean
  targets?: MaintenanceTargetInput[]
  device_ids?: number[]
  group_ids?: number[]
}

export interface ActiveMaintenancesResponse {
  active_windows: MaintenanceView[]
  device_map: Record<string, ActiveMaintenance>
  checked_at: string
}
