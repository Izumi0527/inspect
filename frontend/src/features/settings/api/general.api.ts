import { httpClient } from '@/lib/api-client'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
} from '../types/general.types'
import { requireBulkSuccess, type BulkUpdateResponse } from './bulk'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: unknown
  category: string
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

function toEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  const match = allowed.find((item) => item.toLowerCase() === normalized)
  return match ?? fallback
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
    const allSettings = response.items || []

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, unknown>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
    return {
      basicInfo: {
        applicationName: toString(settingsMap.get('system.application_name'), '网络设备巡检系统'),
        version: toString(settingsMap.get('system.version'), '1.0.0'),
        timezone: toString(settingsMap.get('system.timezone'), 'Asia/Shanghai'),
      },
      inspectionConfig: {
        maxConcurrentTasks: toNumber(settingsMap.get('inspection.max_concurrent_tasks'), 10),
        defaultTimeout: toNumber(settingsMap.get('inspection.default_timeout'), 30),
        retryAttempts: toNumber(settingsMap.get('inspection.retry_attempts'), 3),
      },
      reportConfig: {
        defaultFormat: toEnum(settingsMap.get('report.default_format'), ['excel', 'pdf', 'csv'] as const, 'excel'),
        maxExportRecords: toNumber(settingsMap.get('report.max_export_records'), 10000),
      },
      userPreference: {
        theme: toEnum(settingsMap.get('user_preference.theme'), ['light', 'dark', 'auto'] as const, 'auto'),
        language: toEnum(settingsMap.get('user_preference.language'), ['zh-CN', 'en-US'] as const, 'zh-CN'),
        dateFormat: toString(settingsMap.get('user_preference.date_format'), 'YYYY-MM-DD'),
        timeFormat: toEnum(settingsMap.get('user_preference.time_format'), ['12h', '24h'] as const, '24h'),
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

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存通用配置' })
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
