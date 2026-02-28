import { httpClient } from '@/lib/api-client'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
} from '../types/general.types'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: any
  category: string
}

export const generalApi = {
  /**
   * 获取所有通用配置
   * 从后端获取配置后，转换为结构化数据
   * ✅ 使用新的统一 API 端点
   */
  getGeneralSettings: async (): Promise<GeneralSettingsResponse> => {
    // 获取所有配置（使用新的统一端点）
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/general')
    const allSettings = response.items

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, any>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
    return {
      basicInfo: {
        applicationName: settingsMap.get('system.application_name') || '网络设备巡检系统',
        version: settingsMap.get('system.version') || '1.0.0',
        timezone: settingsMap.get('system.timezone') || 'Asia/Shanghai',
      },
      inspectionConfig: {
        maxConcurrentTasks: settingsMap.get('inspection.max_concurrent_tasks') || 10,
        defaultTimeout: settingsMap.get('inspection.default_timeout') || 30,
        retryAttempts: settingsMap.get('inspection.retry_attempts') || 3,
      },
      reportConfig: {
        defaultFormat: settingsMap.get('report.default_format') || 'excel',
        maxExportRecords: settingsMap.get('report.max_export_records') || 10000,
      },
      userPreference: {
        theme: settingsMap.get('user_preference.theme') || 'auto',
        language: settingsMap.get('user_preference.language') || 'zh-CN',
        dateFormat: settingsMap.get('user_preference.date_format') || 'YYYY-MM-DD',
        timeFormat: settingsMap.get('user_preference.time_format') || '24h',
      },
    }
  },

  /**
   * 更新基础信息
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateBasicInfo: async (data: Partial<BasicInfoConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.applicationName !== undefined) {
      updates.push(
        httpClient.put('/settings/general/system.application_name', {
          value: data.applicationName,  // ✅ 只发送 value
        })
      )
    }

    if (data.timezone !== undefined) {
      updates.push(
        httpClient.put('/settings/general/system.timezone', {
          value: data.timezone,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新巡检配置
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateInspectionConfig: async (data: Partial<InspectionConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.maxConcurrentTasks !== undefined) {
      updates.push(
        httpClient.put('/settings/general/inspection.max_concurrent_tasks', {
          value: data.maxConcurrentTasks,  // ✅ 只发送 value
        })
      )
    }

    if (data.defaultTimeout !== undefined) {
      updates.push(
        httpClient.put('/settings/general/inspection.default_timeout', {
          value: data.defaultTimeout,  // ✅ 只发送 value
        })
      )
    }

    if (data.retryAttempts !== undefined) {
      updates.push(
        httpClient.put('/settings/general/inspection.retry_attempts', {
          value: data.retryAttempts,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新报表配置
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateReportConfig: async (data: Partial<ReportConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.defaultFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/general/report.default_format', {
          value: data.defaultFormat,  // ✅ 只发送 value
        })
      )
    }

    if (data.maxExportRecords !== undefined) {
      updates.push(
        httpClient.put('/settings/general/report.max_export_records', {
          value: data.maxExportRecords,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新用户偏好
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateUserPreference: async (data: Partial<UserPreferenceConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.theme !== undefined) {
      updates.push(
        httpClient.put('/settings/general/user_preference.theme', {
          value: data.theme,  // ✅ 只发送 value
        })
      )
    }

    if (data.language !== undefined) {
      updates.push(
        httpClient.put('/settings/general/user_preference.language', {
          value: data.language,  // ✅ 只发送 value
        })
      )
    }

    if (data.dateFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/general/user_preference.date_format', {
          value: data.dateFormat,  // ✅ 只发送 value
        })
      )
    }

    if (data.timeFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/general/user_preference.time_format', {
          value: data.timeFormat,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 批量保存所有配置
   * ✅ 使用新的统一 API 端点
   */
  saveAll: async (data: GeneralSettingsResponse): Promise<void> => {
    // 构建批量更新的配置对象
    const settings: Record<string, any> = {
      'system.application_name': data.basicInfo.applicationName,
      'system.timezone': data.basicInfo.timezone,
      'inspection.max_concurrent_tasks': data.inspectionConfig.maxConcurrentTasks,
      'inspection.default_timeout': data.inspectionConfig.defaultTimeout,
      'inspection.retry_attempts': data.inspectionConfig.retryAttempts,
      'report.default_format': data.reportConfig.defaultFormat,
      'report.max_export_records': data.reportConfig.maxExportRecords,
      'user_preference.theme': data.userPreference.theme,
      'user_preference.language': data.userPreference.language,
      'user_preference.date_format': data.userPreference.dateFormat,
      'user_preference.time_format': data.userPreference.timeFormat,
    }

    await httpClient.post('/settings/general/bulk', { settings })
  },

  /**
   * 获取单个配置（额外方法）
   * GET /api/v1/settings/general/settings/{key}
   * ✅ 使用新的统一 API 端点
   */
  getSetting: async (key: string): Promise<BackendSetting> => {
    return httpClient.get<BackendSetting>(`/settings/general/settings/${key}`)
  },

  /**
   * 更新单个配置（通用方法）
   * PUT /api/v1/settings/general/settings/{key}
   * ✅ 使用新的统一 API 端点
   */
  updateSetting: async (key: string, value: any): Promise<BackendSetting> => {
    return httpClient.put<BackendSetting>(`/settings/general/settings/${key}`, { value })
  },
}
