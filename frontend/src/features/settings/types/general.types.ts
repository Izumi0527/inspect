export interface BasicInfoConfig {
  applicationName: string
  version: string
  timezone: string
}

export interface InspectionConfig {
  maxConcurrentTasks: number
  defaultTimeout: number
  retryAttempts: number
}

export interface ReportConfig {
  defaultFormat: 'excel' | 'pdf' | 'csv'
  maxExportRecords: number
}

export interface UserPreferenceConfig {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  dateFormat: string
  timeFormat: '12h' | '24h'
}

export interface GeneralSettingsResponse {
  basicInfo: BasicInfoConfig
  inspectionConfig: InspectionConfig
  reportConfig: ReportConfig
  userPreference: UserPreferenceConfig
}

export interface ValidationRule {
  min?: number
  max?: number
  pattern?: string
  options?: Array<{ label: string; value: string | number }>
}

export interface UpdateBasicInfoRequest {
  applicationName?: string
  timezone?: string
}

export interface UpdateInspectionConfigRequest {
  maxConcurrentTasks?: number
  defaultTimeout?: number
  retryAttempts?: number
}

export interface UpdateReportConfigRequest {
  defaultFormat?: 'excel' | 'pdf' | 'csv'
  maxExportRecords?: number
}

export interface UpdateUserPreferenceRequest {
  theme?: 'light' | 'dark' | 'auto'
  language?: 'zh-CN' | 'en-US'
  dateFormat?: string
  timeFormat?: '12h' | '24h'
}

/**
 * 导出配置响应类型
 */
export interface ExportConfigResponse {
  config_data: Record<string, {
    value: any
    category?: string
    description?: string
  }>
  export_time: string  // ISO datetime
  total_count: number
}

/**
 * 导入配置响应类型
 */
export interface ImportConfigResponse {
  imported_count: number
  skipped_count: number
  failed_keys: string[]
  message: string
}
