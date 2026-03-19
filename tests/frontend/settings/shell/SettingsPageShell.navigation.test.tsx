import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPageShell } from '@/features/settings/shell/SettingsPageShell'
import { Permission } from '@/lib/types/auth.types'

const pushMock = jest.fn()
const replaceMock = jest.fn()
const useSearchParamsMock = jest.fn<URLSearchParams | null, []>()
const usePermissionMock = jest.fn<boolean, [Permission]>()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (perm: Permission) => usePermissionMock(perm),
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
  useSearchParams: () => useSearchParamsMock(),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/settings/components/general/GeneralSettings', () => ({
  GeneralSettings: () => <div>general-settings</div>,
}))
jest.mock('@/features/settings/components/logs/LogsSettings', () => ({
  LogsSettings: () => <div>logs-settings</div>,
}))
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
  MonitoringDashboard: () => <div>monitoring-dashboard</div>,
}))

describe('SettingsPageShell 导航与 URL(tab) 状态', () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
    useSearchParamsMock.mockReset()
    usePermissionMock.mockReset()
  })

  it('URL tab 合法且可见时，应渲染对应子页', () => {
    usePermissionMock.mockImplementation(() => true)
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=monitoring'))

    render(<SettingsPageShell />)

    expect(screen.getByText('monitoring-dashboard')).toBeInTheDocument()
    expect(screen.queryByText('general-settings')).not.toBeInTheDocument()
  })

  it('URL tab 非法时，应纠偏到默认可见 Tab 并 replace URL', async () => {
    usePermissionMock.mockImplementation(() => true)
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=unknown'))

    render(<SettingsPageShell />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    expect(replaceMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=general'))
  })

  it('URL tab 不可见时，应纠偏到默认可见 Tab 并 replace URL', async () => {
    usePermissionMock.mockImplementation((perm) => perm === Permission.SYSTEM_CONFIG)
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=audit'))

    render(<SettingsPageShell />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()
    expect(screen.queryByText('audit')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    expect(replaceMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=general'))
  })

  it('用户点击 Tab 时应 push 更新 URL', async () => {
    usePermissionMock.mockImplementation(() => true)
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=general'))

    const user = userEvent.setup()
    render(<SettingsPageShell />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()

    await user.click(screen.getByText('日志设置'))

    expect(pushMock).toHaveBeenCalled()
    expect(pushMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=logs'))
  })
})

