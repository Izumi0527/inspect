import {
  SECURITY_NUMERIC_RULES,
  validateSecuritySettings,
} from '@/features/settings/utils/security-validation'
import type { SecuritySettingsResponse } from '@/features/settings/types/security.types'

const valid: SecuritySettingsResponse = {
  sessionManagement: {
    sessionTimeout: 30,
    autoLogoutEnabled: true,
    rememberMeEnabled: true,
    rememberMeDuration: 7,
    maxConcurrentSessions: 3,
    forceLogoutOnPasswordChange: true,
  },
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    passwordExpireDays: 90,
    passwordHistoryCount: 5,
    preventCommonPasswords: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  },
  authentication: {
    ipWhitelistEnabled: false,
    ipWhitelist: [],
  },
}

describe('validateSecuritySettings', () => {
  it('合法配置通过', () => {
    expect(validateSecuritySettings(valid)).toEqual({ ok: true })
  })

  it('数字越界时按字段标签逐条报错', () => {
    const result = validateSecuritySettings({
      ...valid,
      sessionManagement: { ...valid.sessionManagement, sessionTimeout: 0, maxConcurrentSessions: 11 },
      passwordPolicy: { ...valid.passwordPolicy, minLength: 33, lockoutDuration: 4 },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      '会话超时时间必须在 5-1440 之间',
      '最大并发会话数必须在 1-10 之间',
      '最小密码长度必须在 6-32 之间',
      '账户锁定时长必须在 5-1440 之间',
    ])
  })

  it('关闭"记住我"时不校验其持续时间', () => {
    const result = validateSecuritySettings({
      ...valid,
      sessionManagement: { ...valid.sessionManagement, rememberMeEnabled: false, rememberMeDuration: 0 },
    })
    expect(result).toEqual({ ok: true })
  })

  it('启用 IP 白名单但列表为空时给出提示', () => {
    const result = validateSecuritySettings({
      ...valid,
      authentication: { ipWhitelistEnabled: true, ipWhitelist: [] },
    })
    expect(result).toEqual({ ok: false, errors: ['已启用 IP 白名单，但尚未添加任何 IP 地址'] })
  })

  it('区间表与输入框范围一致（后端 generalNumericConstraints 同源）', () => {
    expect(SECURITY_NUMERIC_RULES.sessionTimeout).toEqual({ min: 5, max: 1440, label: '会话超时时间' })
    expect(SECURITY_NUMERIC_RULES.passwordExpireDays).toEqual({ min: 0, max: 365, label: '密码过期时间' })
    expect(SECURITY_NUMERIC_RULES.passwordHistoryCount).toEqual({ min: 0, max: 20, label: '密码历史记录数量' })
    expect(SECURITY_NUMERIC_RULES.maxLoginAttempts).toEqual({ min: 3, max: 10, label: '最大登录尝试次数' })
  })
})
