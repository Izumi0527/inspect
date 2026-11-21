/**
 * 星标关注池、TopN 排行、实时指标明细与多指标同图对比强类型契约
 */

export interface PinnedDeviceItem {
  device_id: number
  name: string
  ip_address: string
  status: string
  pinned_at: string
}

export interface PinnedDevicesResponse {
  device_ids: number[]
  items: PinnedDeviceItem[]
  total: number
  limit: number
}

export type TopNMetric =
  | 'cpu'
  | 'memory'
  | 'temperature'
  | 'if_util'
  | 'if_errors'
  | 'ping_rtt'

export interface TopNItem {
  device_id: number
  device_name: string
  ip_address: string
  status: string
  interface_name?: string
  value: number
  unit: string
}

export interface TopNResponse {
  metric: TopNMetric | string
  unit: string
  items: TopNItem[]
}

export interface LatestDataQueryParams {
  device_ids?: number[]
  group_id?: number
  application_tag?: string
  search?: string
  changed_only?: boolean
  abnormal_only?: boolean
  page?: number
  page_size?: number
}

export interface LatestDataItem {
  device_id: number
  device_name: string
  ip_address: string
  metric_name: string
  metric_label: string
  interface_name: string
  interface_display_name?: string
  item_key: string
  application_tag: string
  metric_value: number | null
  prev_value: number | null
  delta: number | null
  delta_display?: string
  display_value: string
  raw_text?: string
  metric_unit?: string
  is_abnormal: boolean
  collected_at: string
}

export interface LatestDataPageResponse {
  items: LatestDataItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AdhocSeriesSpec {
  device_id: number
  metric_name: string
  interface_name?: string
}

export interface AdhocGraphRequest {
  series: AdhocSeriesSpec[]
  time_range?: string
  start_time?: string
  end_time?: string
}

export interface AdhocSeriesData {
  key: string
  device_id: number
  device_name: string
  metric_name: string
  metric_label: string
  interface_name?: string
  unit?: string
  values: Array<number | null>
}

export interface AdhocGraphResponse {
  timestamps: string[]
  start_time: string
  end_time: string
  series: AdhocSeriesData[]
}
