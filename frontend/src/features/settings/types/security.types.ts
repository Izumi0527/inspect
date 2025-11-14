// 会话管理配置
export interface SessionManagementConfig {
  sessionTimeout: number // 会话超时时间（分钟）
  autoLogoutEnabled: boolean // 是否启用自动登出
  rememberMeEnabled: boolean // 是否允许"记住我"功能
  rememberMeDuration: number // "记住我"持续时间（天）
  maxConcurrentSessions: number // 最大并发会话数
  forceLogoutOnPasswordChange: boolean // 密码更改后强制登出
}

// 密码策略配置
export interface PasswordPolicyConfig {
  minLength: number // 最小长度
  requireUppercase: boolean // 需要大写字母
  requireLowercase: boolean // 需要小写字母
  requireNumbers: boolean // 需要数字
  requireSpecialChars: boolean // 需要特殊字符
  passwordExpireDays: number // 密码过期天数（0=永不过期）
  passwordHistoryCount: number // 密码历史记录数量
  preventCommonPasswords: boolean // 防止使用常见密码
  maxLoginAttempts: number // 最大登录尝试次数
  lockoutDuration: number // 账户锁定时长（分钟）
}

// 认证方式配置
export interface AuthenticationConfig {
  mfaEnabled: boolean // 是否启用多因素认证
  mfaMethods: Array<'totp' | 'sms' | 'email'> // 支持的MFA方法
  mfaRequired: boolean // 是否强制所有用户使用MFA
  allowOAuthLogin: boolean // 是否允许OAuth登录
  oauthProviders: Array<'google' | 'microsoft' | 'github'> // 支持的OAuth提供商
  allowLdapLogin: boolean // 是否允许LDAP登录
  ldapServerUrl: string // LDAP服务器地址
  ipWhitelistEnabled: boolean // 是否启用IP白名单
  ipWhitelist: string[] // IP白名单列表
}

// 完整的安全设置响应
export interface SecuritySettingsResponse {
  sessionManagement: SessionManagementConfig
  passwordPolicy: PasswordPolicyConfig
  authentication: AuthenticationConfig
}

// 更新请求类型
export interface UpdateSessionManagementRequest {
  sessionTimeout?: number
  autoLogoutEnabled?: boolean
  rememberMeEnabled?: boolean
  rememberMeDuration?: number
  maxConcurrentSessions?: number
  forceLogoutOnPasswordChange?: boolean
}

export interface UpdatePasswordPolicyRequest {
  minLength?: number
  requireUppercase?: boolean
  requireLowercase?: boolean
  requireNumbers?: boolean
  requireSpecialChars?: boolean
  passwordExpireDays?: number
  passwordHistoryCount?: number
  preventCommonPasswords?: boolean
  maxLoginAttempts?: number
  lockoutDuration?: number
}

export interface UpdateAuthenticationRequest {
  mfaEnabled?: boolean
  mfaMethods?: Array<'totp' | 'sms' | 'email'>
  mfaRequired?: boolean
  allowOAuthLogin?: boolean
  oauthProviders?: Array<'google' | 'microsoft' | 'github'>
  allowLdapLogin?: boolean
  ldapServerUrl?: string
  ipWhitelistEnabled?: boolean
  ipWhitelist?: string[]
}
