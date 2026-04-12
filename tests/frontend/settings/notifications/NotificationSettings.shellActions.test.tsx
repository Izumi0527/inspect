import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationSettings } from '@/features/settings/components/notifications/NotificationSettings'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseNotificationSettings = jest.fn()
const saveAllMock = jest.fn()
const resetAllMock = jest.fn()

jest.mock('@/features/settings/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => mockUseNotificationSettings(),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/settings/components/notifications/EmailNotificationSection', () => ({
  EmailNotificationSection: (props: {
    actions?: {
      isDirty: boolean
      isSaving: boolean
      onSave: () => void
      onReset: () => void
    }
  }) => (
    <div>
      <div>email-notification-section</div>
      {props.actions ? (
        <div role="group" aria-label="邮件通知操作">
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
      <div>保存整页更改会同时提交当前页面中的邮件和短信配置。</div>
      <div>测试发送用于验证通知链路；如刚修改配置，建议先保存整页更改后再测试。</div>
    </div>
  ),
}))
jest.mock('@/features/settings/components/notifications/SmsNotificationSection', () => ({
  SmsNotificationSection: () => <div>sms-notification-section</div>,
}))
describe('NotificationSettings 壳层动作区迁移', () => {
  beforeEach(() => {
    mockUseNotificationSettings.mockReturnValue({
      emailNotification: { enabled: true },
      smsNotification: { enabled: false },
      isLoading: false,
      isSaving: false,
      isTesting: false,
      isDirty: true,
      error: null,
      updateEmailNotification: jest.fn(),
      updateSmsNotification: jest.fn(),
      saveAll: saveAllMock.mockResolvedValue(undefined),
      resetAll: resetAllMock,
      testEmailNotification: jest.fn(),
      testSmsNotification: jest.fn(),
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应展示通知摘要，并将整页保存动作下移到邮件通知模块标题行', async () => {
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
      <SettingsShellProvider activeTabKey="notifications">
        <NotificationSettings />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('email-notification-section')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '通知中心' })).toBeInTheDocument()
    expect(screen.getByText('邮件通知')).toBeInTheDocument()
    expect(screen.getByText('短信通知')).toBeInTheDocument()
    expect(screen.queryByText('Webhook')).not.toBeInTheDocument()
    expect(screen.getAllByText('已启用渠道').length).toBeGreaterThan(0)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '保存整页更改' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '重置整页更改' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '邮件通知操作' })).toBeInTheDocument()
    expect(screen.getByText(/保存整页更改会同时提交当前页面中的邮件和短信配置/)).toBeInTheDocument()
    expect(screen.getByText(/测试发送用于验证通知链路/)).toBeInTheDocument()
    expect(screen.queryByText('webhook-notification-section')).not.toBeInTheDocument()

    expect(screen.getByTestId('shell-caps')).toHaveTextContent('dirty:true')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('saving:false')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('blockLeave:true')

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(resetAllMock).toHaveBeenCalled()
  })
})

