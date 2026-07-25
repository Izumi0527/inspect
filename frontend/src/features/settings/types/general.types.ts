export interface BasicInfoConfig {
  applicationName: string
  version: string
  timezone: string
}

/**
 * 巡检数字配置的编辑态：null 表示输入框被清空的暂态，
 * 保存前经 validateGeneralSettings 校验拦截，不会提交到后端。
 */
export interface InspectionConfig {
  maxConcurrentTasks: number | null
  defaultTimeout: number | null
  retryAttempts: number | null
}

export interface ReportConfig {
  defaultFormat: 'excel' | 'pdf' | 'csv'
  maxExportRecords: number | null
}

export interface UserPreferenceConfig {
  theme: 'light' | 'dark' | 'auto'
  timeFormat: '12h' | '24h'
}

export interface GeneralSettingsResponse {
  basicInfo: BasicInfoConfig
  inspectionConfig: InspectionConfig
  reportConfig: ReportConfig
  userPreference: UserPreferenceConfig
}

/** 通过保存前校验后的形状：数字字段收窄为非空。 */
export interface ValidatedGeneralSettings {
  basicInfo: BasicInfoConfig
  inspectionConfig: {
    maxConcurrentTasks: number
    defaultTimeout: number
    retryAttempts: number
  }
  reportConfig: {
    defaultFormat: 'excel' | 'pdf' | 'csv'
    maxExportRecords: number
  }
  userPreference: UserPreferenceConfig
}
