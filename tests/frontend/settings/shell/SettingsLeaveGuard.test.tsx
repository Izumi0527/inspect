import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPageShell } from '@/features/settings/shell/SettingsPageShell'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

const pushMock = jest.fn()
const replaceMock = jest.fn()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams('tab=general'),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/settings/components/general/GeneralSettings', () => ({
  GeneralSettings: () => {
    useSettingsTabCapabilities('general', {
      dirty: true,
      blockLeave: true,
    })
    return <div>general-settings</div>
  },
}))

jest.mock('@/features/settings/components/logs/LogsSettings', () => ({
  LogsSettings: () => <div>logs-settings</div>,
}))

// 其它子页保持最小 mock，避免引入无关依赖
jest.mock('@/features/settings/components/users/UserManagement', () => ({
  UserManagement: () => <div>users</div>,
}))
jest.mock('@/features/settings/components/roles/RoleManagement', () => ({
  RoleManagement: () => <div>roles</div>,
}))
jest.mock('@/features/settings/components/security/SecuritySettings', () => ({
  SecuritySettings: () => <div>security</div>,
}))
jest.mock('@/features/settings/components/audit/AuditLogs', () => ({
  AuditLogs: () => <div>audit</div>,
}))
jest.mock('@/features/settings/components/backup/BackupManagement', () => ({
  BackupManagement: () => <div>backup</div>,
}))
jest.mock('@/features/settings/components/notifications/NotificationSettings', () => ({
  NotificationSettings: () => <div>notifications</div>,
}))
jest.mock('@/features/settings/components/monitoring/MonitoringDashboard', () => ({
  MonitoringDashboard: () => <div>monitoring</div>,
}))

describe('SettingsLeaveGuard', () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
  })

  it('当 blockLeave=true 时，切换 Tab 应触发离开拦截（用户取消则不导航）', async () => {
    const user = userEvent.setup()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)

    render(<SettingsPageShell />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()

    await user.click(screen.getByText('日志设置'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('当 blockLeave=true 时，用户确认离开则允许导航', async () => {
    const user = userEvent.setup()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SettingsPageShell />)

    await user.click(screen.getByText('日志设置'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalled()
    expect(pushMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=logs'))

    confirmSpy.mockRestore()
  })
})
