import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SecuritySettings } from '@/features/settings/components/security/SecuritySettings'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseSecuritySettings = jest.fn()
const saveAllMock = jest.fn()
const resetAllMock = jest.fn()

jest.mock('@/features/settings/hooks/useSecuritySettings', () => ({
  useSecuritySettings: () => mockUseSecuritySettings(),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/settings/components/security/SessionManagementSection', () => ({
  SessionManagementSection: () => (
    <div>
      <div>session-management-section</div>
    </div>
  ),
}))
jest.mock('@/features/settings/components/security/PasswordPolicySection', () => ({
  PasswordPolicySection: (props: {
    actions?: {
      isDirty: boolean
      isSaving: boolean
      onSave: () => void
      onReset: () => void
    }
  }) => (
    <div>
      <div>password-policy-section</div>
      <div>保存整页更改会同时提交当前页面中的密码策略、会话管理和认证方式配置。</div>
      {props.actions ? (
        <div role="group" aria-label="密码策略操作">
          <button
            type="button"
            onClick={props.actions.onReset}
            disabled={!props.actions.isDirty || props.actions.isSaving}
          >
            重置整页更改
          </button>
          <button
            type="button"
            onClick={props.actions.onSave}
            disabled={!props.actions.isDirty || props.actions.isSaving}
          >
            {props.actions.isSaving ? '保存中...' : '保存整页更改'}
          </button>
        </div>
      ) : (
        <div>no-local-actions</div>
      )}
    </div>
  ),
}))
jest.mock('@/features/settings/components/security/AuthenticationSection', () => ({
  AuthenticationSection: () => <div>authentication-section</div>,
}))

describe('SecuritySettings 壳层动作区迁移', () => {
  beforeEach(() => {
    mockUseSecuritySettings.mockReturnValue({
      sessionManagement: { maxConcurrentSessions: 3 },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
      },
      authentication: { mfaEnabled: true, mfaRequired: false, ipWhitelistEnabled: true, ipWhitelist: ['10.0.0.0/8'] },
      isLoading: false,
      isSaving: false,
      isDirty: true,
      error: null,
      updateSessionManagement: jest.fn(),
      updatePasswordPolicy: jest.fn(),
      updateAuthentication: jest.fn(),
      saveAll: saveAllMock.mockResolvedValue(undefined),
      resetAll: resetAllMock,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应展示安全摘要，并将整页保存动作下移到密码策略模块标题行', async () => {
    const user = userEvent.setup()

    const ShellToolbar: React.FC = () => {
      const { activeTabCapabilities } = useSettingsShellState()
      return (
        <div data-testid="shell-toolbar">
          <SettingsToolbar
            toolbar={activeTabCapabilities?.toolbar}
            primaryActions={activeTabCapabilities?.primaryActions}
            secondaryActions={activeTabCapabilities?.secondaryActions}
          />
          <div data-testid="shell-caps">
            dirty:{String(activeTabCapabilities?.dirty)};saving:{String(
              activeTabCapabilities?.saving
            )}
            ;blockLeave:{String(activeTabCapabilities?.blockLeave)}
          </div>
        </div>
      )
    }

    render(
      <SettingsShellProvider activeTabKey="security">
        <SecuritySettings />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('password-policy-section')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '安全策略' })).toBeInTheDocument()
    expect(screen.getByText('最小密码长度')).toBeInTheDocument()
    expect(screen.getByText('MFA 状态')).toBeInTheDocument()
    expect(screen.getByText('IP 白名单')).toBeInTheDocument()
    expect(screen.getByText('最大并发会话数')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '保存整页更改' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '重置整页更改' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '密码策略操作' })).toBeInTheDocument()
    expect(screen.getByText(/保存整页更改会同时提交当前页面中的密码策略、会话管理和认证方式配置/)).toBeInTheDocument()

    expect(screen.getByTestId('shell-caps')).toHaveTextContent('dirty:true')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('saving:false')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('blockLeave:true')

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(resetAllMock).toHaveBeenCalled()
  })
})

