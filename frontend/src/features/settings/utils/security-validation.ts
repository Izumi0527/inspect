import type { SecuritySettingsResponse } from '../types/security.types'

interface NumericRule {
  min: number
  max: number
  label: string
}

/**
 * 安全策略数字项的合法区间。与后端 settings/general_validation.go 的
 * generalNumericConstraints（security.* 段）保持同步，两处集合修改时必须一起改。
 */
export const SECURITY_NUMERIC_RULES: Record<
  | 'sessionTimeout'
  | 'rememberMeDuration'
  | 'maxConcurrentSessions'
  | 'minLength'
  | 'passwordExpireDays'
  | 'passwordHistoryCount'
  | 'maxLoginAttempts'
  | 'lockoutDuration',
  NumericRule
> = {
  sessionTimeout: { min: 5, max: 1440, label: '会话超时时间' },
  rememberMeDuration: { min: 1, max: 90, label: '记住我持续时间' },
  maxConcurrentSessions: { min: 1, max: 10, label: '最大并发会话数' },
  minLength: { min: 6, max: 32, label: '最小密码长度' },
  passwordExpireDays: { min: 0, max: 365, label: '密码过期时间' },
  passwordHistoryCount: { min: 0, max: 20, label: '密码历史记录数量' },
  maxLoginAttempts: { min: 3, max: 10, label: '最大登录尝试次数' },
  lockoutDuration: { min: 5, max: 1440, label: '账户锁定时长' },
}

export type SecurityValidationResult = { ok: true } | { ok: false; errors: string[] }

function checkNumeric(value: number, rule: NumericRule, errors: string[]): void {
  if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
    errors.push(`${rule.label}必须在 ${rule.min}-${rule.max} 之间`)
  }
}

/** 保存前整页校验：数字项在区间内；启用 IP 白名单时列表非空。 */
export function validateSecuritySettings(input: SecuritySettingsResponse): SecurityValidationResult {
  const errors: string[] = []
  const { sessionManagement: session, passwordPolicy: password, authentication: auth } = input

  checkNumeric(session.sessionTimeout, SECURITY_NUMERIC_RULES.sessionTimeout, errors)
  if (session.rememberMeEnabled) {
    checkNumeric(session.rememberMeDuration, SECURITY_NUMERIC_RULES.rememberMeDuration, errors)
  }
  checkNumeric(session.maxConcurrentSessions, SECURITY_NUMERIC_RULES.maxConcurrentSessions, errors)

  checkNumeric(password.minLength, SECURITY_NUMERIC_RULES.minLength, errors)
  checkNumeric(password.passwordExpireDays, SECURITY_NUMERIC_RULES.passwordExpireDays, errors)
  checkNumeric(password.passwordHistoryCount, SECURITY_NUMERIC_RULES.passwordHistoryCount, errors)
  checkNumeric(password.maxLoginAttempts, SECURITY_NUMERIC_RULES.maxLoginAttempts, errors)
  checkNumeric(password.lockoutDuration, SECURITY_NUMERIC_RULES.lockoutDuration, errors)

  if (auth.ipWhitelistEnabled && auth.ipWhitelist.length === 0) {
    errors.push('已启用 IP 白名单，但尚未添加任何 IP 地址')
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
