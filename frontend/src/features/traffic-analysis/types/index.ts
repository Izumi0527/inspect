export interface TrafficMetrics {
  timestamp: string
  device_ip: string
  interface: string
  bytes_in: number
  bytes_out: number
  packets_in: number
  packets_out: number
  bandwidth_utilization: number
  errors: number
  discards: number
}

export interface TrafficAnomaly {
  timestamp: string
  device_ip: string
  interface: string
  anomaly_type: 'traffic_spike' | 'traffic_drop' | 'high_utilization' | 'high_errors'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  baseline_value: number
  current_value: number
  confidence: number
  metadata: Record<string, unknown>
}

export interface TrafficTrend {
  device_ip: string
  interface: string
  current_in: number
  current_out: number
  current_utilization: number
  trend_in: number
  trend_out: number
  trend_utilization: number
  avg_in: number
  avg_out: number
  avg_utilization: number
  peak_in: number
  peak_out: number
  peak_utilization: number
}

export interface TrafficSummary {
  total_devices: number
  total_interfaces: number
  active_anomalies: number
  baseline_patterns: number
  devices: Record<string, {
    interfaces: Record<string, {
      last_seen: string
      avg_utilization: number
      total_bytes: number
    }>
    interface_count: number
    last_update: string
    sample_count: number
  }>
}

export interface TrafficAnalysisRequest {
  device_ips: string[]
  analysis_period_hours: number
  enable_anomaly_detection: boolean
}

export interface TrafficCollectionResponse {
  success: boolean
  device_ip: string
  metrics: TrafficMetrics[]
  collected_at: string
}

export interface TrafficAnomaliesResponse {
  success: boolean
  anomalies: TrafficAnomaly[]
  total_count: number
  query_params: {
    device_ip?: string
    severity?: string
    hours: number
  }
  timestamp: string
}

export interface TrafficTrendsResponse {
  success: boolean
  device_ip: string
  analysis_period_hours: number
  interface_trends: TrafficTrend[]
  total_samples: number
  analysis_timestamp: string
}

export interface TrafficMonitoringConfig {
  device_ips: string[]
  analysis_period_hours: number
  enable_anomaly_detection: boolean
  started_at: string
}

// 流量图表数据格式
export interface TrafficChartData {
  timestamp: string
  bytes_in: number
  bytes_out: number
  utilization: number
  interface: string
}

// 异常统计数据
export interface AnomalyStats {
  total: number
  by_severity: Record<string, number>
  by_type: Record<string, number>
  by_device: Record<string, number>
  recent_count: number
}

// 流量监控过滤器
export interface TrafficFilter {
  device_ips?: string[]
  interfaces?: string[]
  severity?: string
  anomaly_type?: string
  time_range: {
    start: string
    end: string
  }
}

export type TrafficViewMode = 'realtime' | 'trends' | 'anomalies' | 'summary'