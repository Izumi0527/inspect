import { httpClient } from '@/lib/api-client'
import type {
  SessionManagementConfig,
  PasswordPolicyConfig,
  AuthenticationConfig,
  SecuritySettingsResponse,
} from '../types/security.types'
import { requireBulkSuccess, type BulkUpdateResponse } from './bulk'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: any
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

function toEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T[]
): T[] {
  const allowedSet = new Set<string>(allowed)

  const normalize = (raw: unknown): string => {
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
  }

  const pick = (items: unknown[]): T[] => {
    const result: T[] = []
    for (const item of items) {
      const v = normalize(item)
      if (!v) continue
      if (allowedSet.has(v)) result.push(v as T)
    }
    return result.length ? result : fallback
  }

  if (Array.isArray(value)) return pick(value)

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return pick(parsed)
      } catch {
        // ignore
      }
    }
    // 兼容逗号分隔
    if (trimmed.includes(',')) return pick(trimmed.split(','))
    return pick([trimmed])
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
    const settingsMap = new Map<string, any>()
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
        mfaEnabled: toBoolean(settingsMap.get('security.auth.mfa_enabled'), false),
        mfaMethods: toEnumArray<'totp' | 'sms' | 'email'>(
          settingsMap.get('security.auth.mfa_methods'),
          ['totp', 'sms', 'email'],
          ['totp']
        ),
        mfaRequired: toBoolean(settingsMap.get('security.auth.mfa_required'), false),
        allowOAuthLogin: toBoolean(settingsMap.get('security.auth.allow_oauth_login'), false),
        oauthProviders: toEnumArray<'google' | 'microsoft' | 'github'>(
          settingsMap.get('security.auth.oauth_providers'),
          ['google', 'microsoft', 'github'],
          []
        ),
        ipWhitelistEnabled: toBoolean(settingsMap.get('security.auth.ip_whitelist_enabled'), false),
        ipWhitelist: toStringArray(settingsMap.get('security.auth.ip_whitelist'), []),
      },
    }
  },

  /**
   * 更新会话管理配置
   * ✅ 单独更新同样走 bulk（与 saveAll 语义一致，避免 stub/假成功）
   */
  updateSessionManagement: async (data: Partial<SessionManagementConfig>): Promise<void> => {
    const settings: Record<string, any> = {}

    if (data.sessionTimeout !== undefined) settings['security.session.timeout'] = data.sessionTimeout
    if (data.autoLogoutEnabled !== undefined) settings['security.session.auto_logout_enabled'] = data.autoLogoutEnabled
    if (data.rememberMeEnabled !== undefined) settings['security.session.remember_me_enabled'] = data.rememberMeEnabled
    if (data.rememberMeDuration !== undefined) settings['security.session.remember_me_duration'] = data.rememberMeDuration
    if (data.maxConcurrentSessions !== undefined) settings['security.session.max_concurrent_sessions'] = data.maxConcurrentSessions
    if (data.forceLogoutOnPasswordChange !== undefined) {
      settings['security.session.force_logout_on_password_change'] = data.forceLogoutOnPasswordChange
    }

    if (Object.keys(settings).length === 0) return

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存会话管理配置' })
  },

  /**
   * 更新密码策略配置
   * ✅ 单独更新同样走 bulk（与 saveAll 语义一致，避免 stub/假成功）
   */
  updatePasswordPolicy: async (data: Partial<PasswordPolicyConfig>): Promise<void> => {
    const settings: Record<string, any> = {}

    if (data.minLength !== undefined) settings['security.password.min_length'] = data.minLength
    if (data.requireUppercase !== undefined) settings['security.password.require_uppercase'] = data.requireUppercase
    if (data.requireLowercase !== undefined) settings['security.password.require_lowercase'] = data.requireLowercase
    if (data.requireNumbers !== undefined) settings['security.password.require_numbers'] = data.requireNumbers
    if (data.requireSpecialChars !== undefined) settings['security.password.require_special_chars'] = data.requireSpecialChars
    if (data.passwordExpireDays !== undefined) settings['security.password.password_expire_days'] = data.passwordExpireDays
    if (data.passwordHistoryCount !== undefined) settings['security.password.password_history_count'] = data.passwordHistoryCount
    if (data.preventCommonPasswords !== undefined) {
      settings['security.password.prevent_common_passwords'] = data.preventCommonPasswords
    }
    if (data.maxLoginAttempts !== undefined) settings['security.password.max_login_attempts'] = data.maxLoginAttempts
    if (data.lockoutDuration !== undefined) settings['security.password.lockout_duration'] = data.lockoutDuration

    if (Object.keys(settings).length === 0) return

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存密码策略配置' })
  },

  /**
   * 更新认证配置
   * ✅ 单独更新同样走 bulk（与 saveAll 语义一致，避免 stub/假成功）
   */
  updateAuthentication: async (data: Partial<AuthenticationConfig>): Promise<void> => {
    const settings: Record<string, any> = {}

    if (data.mfaEnabled !== undefined) settings['security.auth.mfa_enabled'] = data.mfaEnabled
    if (data.mfaMethods !== undefined) settings['security.auth.mfa_methods'] = data.mfaMethods
    if (data.mfaRequired !== undefined) settings['security.auth.mfa_required'] = data.mfaRequired
    if (data.allowOAuthLogin !== undefined) settings['security.auth.allow_oauth_login'] = data.allowOAuthLogin
    if (data.oauthProviders !== undefined) settings['security.auth.oauth_providers'] = data.oauthProviders
    if (data.ipWhitelistEnabled !== undefined) settings['security.auth.ip_whitelist_enabled'] = data.ipWhitelistEnabled
    if (data.ipWhitelist !== undefined) settings['security.auth.ip_whitelist'] = data.ipWhitelist

    if (Object.keys(settings).length === 0) return

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存认证配置' })
  },

  /**
   * 批量保存所有安全配置
   * ✅ 使用统一批量配置端点: POST /settings/general/bulk
   */
  saveAll: async (data: SecuritySettingsResponse): Promise<void> => {
    const settings: Record<string, any> = {
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

      // 认证配置
      'security.auth.mfa_enabled': data.authentication.mfaEnabled,
      'security.auth.mfa_methods': data.authentication.mfaMethods,
      'security.auth.mfa_required': data.authentication.mfaRequired,
      'security.auth.allow_oauth_login': data.authentication.allowOAuthLogin,
      'security.auth.oauth_providers': data.authentication.oauthProviders,
      'security.auth.ip_whitelist_enabled': data.authentication.ipWhitelistEnabled,
      'security.auth.ip_whitelist': data.authentication.ipWhitelist,
    }

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存安全策略配置' })
  },
}
