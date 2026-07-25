import { httpClient } from '@/lib/api-client'
import type {
  GeneralSettingsResponse,
  ValidatedGeneralSettings,
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

// 与登录页/侧边栏同源的版本号（next.config.js 构建时注入，回退 package.json version）
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '未知'

export const generalApi = {
  /**
   * 获取所有通用配置，转换为结构化数据。
   * system.version 数据库无种子行，回退到全站统一版本号。
   */
  getGeneralSettings: async (): Promise<GeneralSettingsResponse> => {
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/general')
    const allSettings = response.items || []

    const settingsMap = new Map<string, unknown>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    return {
      basicInfo: {
        applicationName: toString(settingsMap.get('system.application_name'), '网络设备巡检系统'),
        version: toString(settingsMap.get('system.version'), APP_VERSION),
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
        timeFormat: toEnum(settingsMap.get('user_preference.time_format'), ['12h', '24h'] as const, '24h'),
      },
    }
  },

  /**
   * 批量保存所有配置。入参必须是 validateGeneralSettings 校验后的数据。
   */
  saveAll: async (data: ValidatedGeneralSettings): Promise<void> => {
    const settings: Record<string, unknown> = {
      'system.application_name': data.basicInfo.applicationName,
      'system.timezone': data.basicInfo.timezone,
      'inspection.max_concurrent_tasks': data.inspectionConfig.maxConcurrentTasks,
      'inspection.default_timeout': data.inspectionConfig.defaultTimeout,
      'inspection.retry_attempts': data.inspectionConfig.retryAttempts,
      'report.default_format': data.reportConfig.defaultFormat,
      'report.max_export_records': data.reportConfig.maxExportRecords,
      'user_preference.theme': data.userPreference.theme,
      'user_preference.time_format': data.userPreference.timeFormat,
    }

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存通用配置' })
  },
}

export interface DisplayPreferencesResponse {
  timezone: string
  time_format: '12h' | '24h'
  application_name: string
}

/**
 * 获取展示偏好（时区/时间制/应用名称；登录即可读，无需 system:config 权限）
 * GET /api/v1/settings/display-preferences
 */
export async function fetchDisplayPreferences(): Promise<DisplayPreferencesResponse> {
  return httpClient.get<DisplayPreferencesResponse>('/settings/display-preferences')
}
