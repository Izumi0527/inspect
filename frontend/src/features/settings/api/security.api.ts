import { httpClient } from '@/lib/api-client'
import type {
  SessionManagementConfig,
  PasswordPolicyConfig,
  AuthenticationConfig,
  SecuritySettingsResponse,
} from '../types/security.types'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: any
  category: string
}

export const securityApi = {
  /**
   * 获取所有安全配置
   * 从后端获取配置后，转换为结构化数据
   * ✅ 使用新的统一 API 端点
   */
  getSecuritySettings: async (): Promise<SecuritySettingsResponse> => {
    // 获取所有配置（使用新的统一端点）
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/security')
    const allSettings = response.items

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, any>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
    return {
      sessionManagement: {
        sessionTimeout: settingsMap.get('security.session.timeout') || 30,
        autoLogoutEnabled: settingsMap.get('security.session.auto_logout_enabled') || true,
        rememberMeEnabled: settingsMap.get('security.session.remember_me_enabled') || true,
        rememberMeDuration: settingsMap.get('security.session.remember_me_duration') || 7,
        maxConcurrentSessions: settingsMap.get('security.session.max_concurrent_sessions') || 3,
        forceLogoutOnPasswordChange:
          settingsMap.get('security.session.force_logout_on_password_change') || true,
      },
      passwordPolicy: {
        minLength: settingsMap.get('security.password.min_length') || 8,
        requireUppercase: settingsMap.get('security.password.require_uppercase') || true,
        requireLowercase: settingsMap.get('security.password.require_lowercase') || true,
        requireNumbers: settingsMap.get('security.password.require_numbers') || true,
        requireSpecialChars: settingsMap.get('security.password.require_special_chars') || true,
        passwordExpireDays: settingsMap.get('security.password.password_expire_days') || 90,
        passwordHistoryCount: settingsMap.get('security.password.password_history_count') || 5,
        preventCommonPasswords:
          settingsMap.get('security.password.prevent_common_passwords') || true,
        maxLoginAttempts: settingsMap.get('security.password.max_login_attempts') || 5,
        lockoutDuration: settingsMap.get('security.password.lockout_duration') || 15,
      },
      authentication: {
        mfaEnabled: settingsMap.get('security.auth.mfa_enabled') || false,
        mfaMethods: settingsMap.get('security.auth.mfa_methods') || ['totp'],
        mfaRequired: settingsMap.get('security.auth.mfa_required') || false,
        allowOAuthLogin: settingsMap.get('security.auth.allow_oauth_login') || false,
        oauthProviders: settingsMap.get('security.auth.oauth_providers') || [],
        allowLdapLogin: settingsMap.get('security.auth.allow_ldap_login') || false,
        ldapServerUrl: settingsMap.get('security.auth.ldap_server_url') || '',
        ipWhitelistEnabled: settingsMap.get('security.auth.ip_whitelist_enabled') || false,
        ipWhitelist: settingsMap.get('security.auth.ip_whitelist') || [],
      },
    }
  },

  /**
   * 更新会话管理配置
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateSessionManagement: async (data: Partial<SessionManagementConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    Object.entries(data).forEach(([key, value]) => {
      const settingKey = `security.session.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      updates.push(
        httpClient.put(`/settings/security/${settingKey}`, {
          value,  // ✅ 只发送 value
        })
      )
    })

    await Promise.all(updates)
  },

  /**
   * 更新密码策略配置
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updatePasswordPolicy: async (data: Partial<PasswordPolicyConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    Object.entries(data).forEach(([key, value]) => {
      const settingKey = `security.password.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      updates.push(
        httpClient.put(`/settings/security/${settingKey}`, {
          value,  // ✅ 只发送 value
        })
      )
    })

    await Promise.all(updates)
  },

  /**
   * 更新认证配置
   * ✅ 修复: 只发送 value 字段
   * ✅ 使用新的统一 API 端点
   */
  updateAuthentication: async (data: Partial<AuthenticationConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    Object.entries(data).forEach(([key, value]) => {
      const settingKey = `security.auth.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      updates.push(
        httpClient.put(`/settings/security/${settingKey}`, {
          value,  // ✅ 只发送 value
        })
      )
    })

    await Promise.all(updates)
  },

  /**
   * 批量保存所有安全配置
   * ✅ 使用新的统一 API 端点
   */
  saveAll: async (data: SecuritySettingsResponse): Promise<void> => {
    const settings: Record<string, any> = {}

    // 会话管理配置
    Object.entries(data.sessionManagement).forEach(([key, value]) => {
      const settingKey = `security.session.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      settings[settingKey] = value
    })

    // 密码策略配置
    Object.entries(data.passwordPolicy).forEach(([key, value]) => {
      const settingKey = `security.password.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      settings[settingKey] = value
    })

    // 认证配置
    Object.entries(data.authentication).forEach(([key, value]) => {
      const settingKey = `security.auth.${key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')}`
      settings[settingKey] = value
    })

    await httpClient.post('/settings/security/bulk', { settings })
  },
}
