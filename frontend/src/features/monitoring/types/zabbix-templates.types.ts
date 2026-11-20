/**
 * 监控方案（模板）、采集指标与端口/硬件自动识别强类型契约
 */

export interface TemplateMacro {
  key: string
  label: string
  unit?: string
  default_value: string
  description?: string
}

export type PreprocessStepType = 'multiplier' | 'change_per_sec' | 'regex' | 'valuemap'

export interface PreprocessStep {
  type: PreprocessStepType | string
  params?: Record<string, string>
}

export interface PrevSample {
  value: number
  collected_at: string
  current_at?: string
}

export interface PreprocessStepTrace {
  step_index: number
  type: string
  input: string
  output: string
  error?: string
}

export interface CustomCollectResult {
  raw_value: string
  steps: PreprocessStepTrace[]
  final_value: string
  display_text: string
  numeric_value?: number
  duration_ms: number
}

export type MonitorItemProtocol = 'builtin' | 'snmp_oid' | 'icmp' | 'tcp_port' | 'http'
export type MonitorItemValueType = 'float' | 'uint' | 'string'

export interface MonitorTemplate {
  id: number
  code: string
  name: string
  vendor: string
  device_type: string
  description: string
  is_builtin: boolean
  default_interval_sec: number
  macros_json: TemplateMacro[] | string
  created_at: string
  updated_at: string
}

export interface MonitorItem {
  id: number
  template_id: number
  item_key: string
  name: string
  application_tag: string
  protocol: MonitorItemProtocol | string
  target_expr: string
  http_scheme: string
  http_port: number
  http_path: string
  value_type: MonitorItemValueType | string
  unit: string
  interval_sec: number
  preprocessing_json: PreprocessStep[] | string
  value_map_json: Record<string, string> | string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface LLDPresetFlags {
  ignore_virtual: boolean
  ignore_idle: boolean
  highlight_uplink: boolean
}

export type LLDEntityType = 'interface' | 'optical' | 'bgp' | 'disk'

export interface MonitorLLDRule {
  id: number
  template_id: number
  rule_key: string
  name: string
  entity_type: LLDEntityType | string
  preset_flags_json: LLDPresetFlags | string
  include_regex: string
  exclude_regex: string
  keep_lost_days: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface TemplateDetailResponse extends MonitorTemplate {
  macros: TemplateMacro[]
  items: MonitorItem[]
  lld_rules: MonitorLLDRule[]
  bound_group_ids: number[]
  bound_device_ids: number[]
  device_overrides?: Record<number, string>
}

export interface CreateTemplateInput {
  code?: string
  name: string
  vendor?: string
  device_type?: string
  description?: string
  default_interval_sec?: number
  macros?: TemplateMacro[]
}

export interface MonitorItemInput {
  item_key: string
  name: string
  application_tag?: string
  protocol: MonitorItemProtocol | string
  target_expr?: string
  http_scheme?: string
  http_port?: number
  http_path?: string
  value_type?: MonitorItemValueType | string
  unit?: string
  interval_sec: number
  preprocessing?: PreprocessStep[]
  value_map?: Record<string, string>
  enabled?: boolean
}

export interface MonitorLLDRuleInput {
  rule_key: string
  name: string
  entity_type: LLDEntityType | string
  preset_flags: LLDPresetFlags
  include_regex?: string
  exclude_regex?: string
  keep_lost_days?: number
  enabled?: boolean
}

export interface DeviceTemplateBindingInput {
  device_id: number
  override_macros?: Record<string, string>
  clear_overrides?: boolean
  enabled?: boolean
}

export interface TemplateBindingsInput {
  group_ids?: number[]
  replace_groups?: boolean
  device_ids?: number[]
  device_overrides?: Record<number, Record<string, string>>
  clear_overrides?: number[]
  binding_items?: DeviceTemplateBindingInput[]
}

export interface LLDPreviewRequest {
  preset_flags: LLDPresetFlags
  include_regex?: string
  exclude_regex?: string
  samples: string[]
}

export interface LLDPreviewResult {
  matched: string[]
  excluded: string[]
}

export interface TestMonitoringItemRequest {
  device_id: number
  item: MonitorItemInput
  prev?: PrevSample
}
