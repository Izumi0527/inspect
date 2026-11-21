/**
 * 采集引擎健康、主机监控矩阵与单机全景详情强类型契约
 */

import type { ActiveMaintenance } from './zabbix-alerts-maint.types'
import type { ThresholdSummary } from './zabbix-dashboard.types'

export type CollectionErrorCode =
  | ''
  | 'auth_failed'
  | 'timeout'
  | 'unreachable'
  | 'unsupported_oid'
  | 'rate_limited'

export interface BackoffDeviceSummary {
  device_id: number
  device_name?: string
  last_error_code: CollectionErrorCode | string
  last_error_message: string
  consecutive_failures: number
  backoff_until?: string
}

export interface EngineHealthSnapshot {
  last_round_started_at?: string
  last_round_finished_at?: string
  duration_ms: number
  total_devices: number
  success_devices: number
  failed_devices: number
  backoff_devices: number
  pending_write_queue: number
  backoff_device_list: BackoffDeviceSummary[]
}

export interface ModulePermissionStatus {
  allowed: boolean
  limitedByPermission?: boolean
  requiredPermission?: string
}

export interface CrossModulePermissions {
  alerts: ModulePermissionStatus
  inspections: ModulePermissionStatus
  logs: ModulePermissionStatus
}

export interface HostCollectionStateView {
  last_error_code: CollectionErrorCode | string
  last_error_message: string
  consecutive_failures: number
  backoff_until?: string
  in_backoff: boolean
  last_success_at?: string
  last_duration_ms: number
}

export interface HostProtocolSummary {
  icmp_status: string
  snmp_status: string
  cli_protocol: string
  icmp_healthy: boolean
  snmp_healthy: boolean
  cli_configured: boolean
}

export interface HostSparklinePoint {
  timestamp: string
  cpu?: number
  memory?: number
}

export interface HostMatrixItem {
  id: number
  name: string
  ip_address: string
  hostname?: string
  device_type: string
  vendor: string
  model?: string
  group_id?: number
  group_name?: string
  status: string
  is_monitored: boolean
  is_pinned: boolean
  in_maintenance: boolean
  maintenance?: ActiveMaintenance
  cpu_usage?: number
  memory_usage?: number
  temperature?: number
  uptime?: number
  response_time?: number
  last_seen?: string
  protocols: HostProtocolSummary
  collection_state: HostCollectionStateView
  interfaces_up: number
  interfaces_total: number
  hardware_fault_count: number
  active_alert_count?: number
  critical_alert_count?: number
  warning_alert_count?: number
  latest_inspection_score?: number
  latest_inspection_at?: string
  error_log_count_24h?: number
  trap_log_count_24h?: number
  sparkline: HostSparklinePoint[]
}

export interface HostsMatrixResponse {
  items: HostMatrixItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
  limitedByPermission: boolean
  permissions: CrossModulePermissions
}

export interface HostsMatrixQueryParams {
  status?: string
  group_id?: number
  pinned_only?: boolean
  problem_only?: boolean
  protocol?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface HostInterfaceDetail {
  id: number
  name: string
  display_name?: string
  description?: string
  alias?: string
  speed?: number
  in_octets?: number
  out_octets?: number
  is_up?: boolean
  admin_up: boolean
  duplex_status: string
  in_errors: number
  out_errors: number
  in_discards: number
  out_discards: number
  in_error_rate: number
  out_error_rate: number
  utilization_in: number
  utilization_out: number
  speed_unknown: boolean
  flap_count_1h: number
  last_status_change_at?: string
  lld_monitored: boolean
  lld_lost_since?: string
  last_updated?: string
}

export interface HostInspectionSummary {
  inspection_id: number
  status: string
  score: number
  total_checks: number
  passed_checks: number
  failed_checks: number
  warning_checks: number
  completed_at?: string
}

export interface HostNeighborSummary {
  local_port: string
  remote_device_id?: number
  remote_name: string
  remote_port?: string
  remote_mgmt_ip?: string
  remote_role?: string
  collected_at: string
}

export interface HostLogSummary {
  id: number
  level: string
  source: string
  message: string
  log_timestamp: string
}

export interface HostActiveAlertSummary {
  id: number
  title: string
  severity: string
  status: string
  metric_name?: string
  current_value?: number
  threshold_value?: number
  first_occurred?: string
  last_occurred?: string
  snoozed_until?: string
}

export interface SNMPBGPPeerMetrics {
  index: string
  state?: number
  state_label?: string
  established_time_seconds?: number
  last_error?: string
}

export interface SNMPOpticalTransceiverMetrics {
  index: string
  name?: string
  voltage?: number
  voltage_unit?: string
  bias_current?: number
  bias_current_unit?: string
  tx_power?: number
  tx_power_unit?: string
  rx_power?: number
  rx_power_unit?: string
}

export interface SNMPComponentStatusMetrics {
  index: string
  name?: string
  kind: string
  state?: number
  status_label?: string
  status_level?: string
}

export interface SNMPPoEPortMetrics {
  index: string
  consuming_power?: number
  peak_power?: number
  unit?: string
}

export interface SNMPPoEMetrics {
  ports?: SNMPPoEPortMetrics[]
  remaining_power?: number
  remaining_unit?: string
}

export interface SNMPSTPMetrics {
  protocol_spec?: number
  time_since_topology_change?: number
  top_changes?: number
}

export interface SNMPDiskMetrics {
  mount: string
  total_bytes: number
  used_bytes: number
}

export interface SNMPExtensionsResponse {
  device_id: number
  timestamp?: string
  bgp_peers: SNMPBGPPeerMetrics[]
  optical_transceivers: SNMPOpticalTransceiverMetrics[]
  components: SNMPComponentStatusMetrics[]
  poe?: SNMPPoEMetrics
  stp?: SNMPSTPMetrics
  disks: SNMPDiskMetrics[]
}

export interface HostDetailResponse {
  device: HostMatrixItem
  firmware_version?: string
  serial_number?: string
  location?: string
  topology_role: string
  interfaces: HostInterfaceDetail[]
  snmp_extensions: SNMPExtensionsResponse
  latest_inspection?: HostInspectionSummary
  neighbors: HostNeighborSummary[]
  recent_logs: HostLogSummary[]
  error_log_count_24h?: number
  trap_log_count_24h?: number
  active_alerts: HostActiveAlertSummary[]
  thresholds: ThresholdSummary
  limitedByPermission: boolean
  permissions: CrossModulePermissions
}
