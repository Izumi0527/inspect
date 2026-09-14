import { httpClient } from '@/lib/api-client'
import type { SecuritySettingsResponse } from '../types/security.types'
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

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
  }
  return fallback
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
    return items
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return toStringArray(parsed, fallback)
      } catch {
        // ignore
      }
    }
  }
  return fallback
}

export const securityApi = {
  /**
   * 获取所有安全配置
   * 从后端获取配置后，转换为结构化数据
   * ✅ 使用新的统一 API 端点: GET /settings/security/
   */
  getSecuritySettings: async (): Promise<SecuritySettingsResponse> => {
    // 获取所有配置（使用新的统一端点）
    // 后端实际路由: GET /api/v1/settings/security/
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/security/')
    const allSettings = response.items || []

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, unknown>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
    return {
      sessionManagement: {
        sessionTimeout: toNumber(settingsMap.get('security.session.timeout'), 30),
        autoLogoutEnabled: toBoolean(settingsMap.get('security.session.auto_logout_enabled'), true),
        rememberMeEnabled: toBoolean(settingsMap.get('security.session.remember_me_enabled'), true),
        rememberMeDuration: toNumber(settingsMap.get('security.session.remember_me_duration'), 7),
        maxConcurrentSessions: toNumber(settingsMap.get('security.session.max_concurrent_sessions'), 3),
        forceLogoutOnPasswordChange:
          toBoolean(settingsMap.get('security.session.force_logout_on_password_change'), true),
      },
      passwordPolicy: {
        minLength: toNumber(settingsMap.get('security.password.min_length'), 8),
        requireUppercase: toBoolean(settingsMap.get('security.password.require_uppercase'), true),
        requireLowercase: toBoolean(settingsMap.get('security.password.require_lowercase'), true),
        requireNumbers: toBoolean(settingsMap.get('security.password.require_numbers'), true),
        requireSpecialChars: toBoolean(settingsMap.get('security.password.require_special_chars'), true),
        passwordExpireDays: toNumber(settingsMap.get('security.password.password_expire_days'), 90),
        passwordHistoryCount: toNumber(settingsMap.get('security.password.password_history_count'), 5),
        preventCommonPasswords:
          toBoolean(settingsMap.get('security.password.prevent_common_passwords'), true),
        maxLoginAttempts: toNumber(settingsMap.get('security.password.max_login_attempts'), 5),
        lockoutDuration: toNumber(settingsMap.get('security.password.lockout_duration'), 15),
      },
      authentication: {
        ipWhitelistEnabled: toBoolean(settingsMap.get('security.auth.ip_whitelist_enabled'), false),
        ipWhitelist: toStringArray(settingsMap.get('security.auth.ip_whitelist'), []),
      },
    }
  },

  /**
   * 批量保存所有安全配置
   * ✅ 使用统一批量配置端点: POST /settings/general/bulk
   */
  saveAll: async (data: SecuritySettingsResponse): Promise<void> => {
    const settings: Record<string, unknown> = {
      // 会话管理
      'security.session.timeout': data.sessionManagement.sessionTimeout,
      'security.session.auto_logout_enabled': data.sessionManagement.autoLogoutEnabled,
      'security.session.remember_me_enabled': data.sessionManagement.rememberMeEnabled,
      'security.session.remember_me_duration': data.sessionManagement.rememberMeDuration,
      'security.session.max_concurrent_sessions': data.sessionManagement.maxConcurrentSessions,
      'security.session.force_logout_on_password_change':
        data.sessionManagement.forceLogoutOnPasswordChange,

      // 密码策略
      'security.password.min_length': data.passwordPolicy.minLength,
      'security.password.require_uppercase': data.passwordPolicy.requireUppercase,
      'security.password.require_lowercase': data.passwordPolicy.requireLowercase,
      'security.password.require_numbers': data.passwordPolicy.requireNumbers,
      'security.password.require_special_chars': data.passwordPolicy.requireSpecialChars,
      'security.password.password_expire_days': data.passwordPolicy.passwordExpireDays,
      'security.password.password_history_count': data.passwordPolicy.passwordHistoryCount,
      'security.password.prevent_common_passwords': data.passwordPolicy.preventCommonPasswords,
      'security.password.max_login_attempts': data.passwordPolicy.maxLoginAttempts,
      'security.password.lockout_duration': data.passwordPolicy.lockoutDuration,

      // 访问控制
      'security.auth.ip_whitelist_enabled': data.authentication.ipWhitelistEnabled,
      'security.auth.ip_whitelist': data.authentication.ipWhitelist,
    }

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存安全策略配置' })
  },
}
