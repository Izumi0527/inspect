import { render, screen } from '@testing-library/react'

import { AuthenticationSection } from '@/features/settings/components/security/AuthenticationSection'
import { PasswordPolicySection } from '@/features/settings/components/security/PasswordPolicySection'
import { SecurityOverviewCard } from '@/features/settings/components/security/SecurityOverviewCard'
import { SessionManagementSection } from '@/features/settings/components/security/SessionManagementSection'
import type {
  AuthenticationConfig,
  PasswordPolicyConfig,
  SessionManagementConfig,
} from '@/features/settings/types/security.types'

const passwordPolicy: PasswordPolicyConfig = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  passwordExpireDays: 90,
  passwordHistoryCount: 5,
  preventCommonPasswords: true,
  maxLoginAttempts: 5,
  lockoutDuration: 30,
}

const authentication: AuthenticationConfig = {
  mfaEnabled: true,
  mfaMethods: ['totp'],
  mfaRequired: false,
  allowOAuthLogin: true,
  oauthProviders: ['github'],
  ipWhitelistEnabled: true,
  ipWhitelist: ['10.0.0.0/8'],
}

const sessionManagement: SessionManagementConfig = {
  sessionTimeout: 60,
  autoLogoutEnabled: true,
  rememberMeEnabled: true,
  rememberMeDuration: 30,
  maxConcurrentSessions: 3,
  forceLogoutOnPasswordChange: true,
}

const removedExplanatoryCopies = [
  '当前页面用于定义账户密码基线',
  '该页配置共同决定系统的登录安全基线',
  '定义账户密码强度、生命周期和登录失败防护',
  '保存整页更改会同时提交当前页面中的密码策略、会话管理和认证方式配置',
  '配置多因素认证、OAuth登录和IP白名单',
  '认证方式用于增强登录验证链路',
  '控制访问时效、并发登录与改密后的会话处置',
  '会话策略决定用户登录后可维持多久',
]

const retainedFunctionalCopies = [
  '安全策略',
  '当前安全基线',
  '最小密码长度',
  'MFA 状态',
  'IP 白名单',
  '最大并发会话数',
  '密码复杂度要求',
  '密码策略',
  '认证方式',
  '会话管理',
  '保存整页更改',
  '重置整页更改',
  '密码最少字符数 (6-32个字符)',
  '强制更改周期 (0=永不过期)',
  '支持单个IP (192.168.1.1) 或CIDR格式 (10.0.0.0/8)',
]

describe('SecuritySettings 安全策略页说明文案', () => {
  it('不展示页面导览、区块用途和保存语义说明文案', () => {
    render(
      <div>
        <SecurityOverviewCard
          minLength={passwordPolicy.minLength}
          requireUppercase={passwordPolicy.requireUppercase}
          requireLowercase={passwordPolicy.requireLowercase}
          requireNumbers={passwordPolicy.requireNumbers}
          requireSpecialChars={passwordPolicy.requireSpecialChars}
          mfaEnabled={authentication.mfaEnabled}
          mfaRequired={authentication.mfaRequired}
          ipWhitelistEnabled={authentication.ipWhitelistEnabled}
          ipWhitelistCount={authentication.ipWhitelist.length}
          maxConcurrentSessions={sessionManagement.maxConcurrentSessions}
        />
        <PasswordPolicySection
          data={passwordPolicy}
          onChange={jest.fn()}
          actions={{
            isDirty: true,
            isSaving: false,
            onSave: jest.fn(),
            onReset: jest.fn(),
          }}
        />
        <AuthenticationSection data={authentication} onChange={jest.fn()} />
        <SessionManagementSection data={sessionManagement} onChange={jest.fn()} />
      </div>
    )

    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    for (const copy of retainedFunctionalCopies) {
      expect(screen.getAllByText(copy, { exact: false }).length).toBeGreaterThan(0)
    }
  })
})
