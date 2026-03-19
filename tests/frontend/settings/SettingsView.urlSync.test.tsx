import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from '@/features/settings/components/SettingsView'

const replaceMock = jest.fn()
const pushMock = jest.fn()

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
  MonitoringDashboard: () => <div>monitoring</div>,
}))

describe('SettingsView URL 同步', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
  })

  it('点击 Tab 应回写 ?tab= 到 URL', async () => {
    const user = userEvent.setup()
    render(<SettingsView />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()

    await user.click(screen.getByText('日志设置'))

    expect(pushMock).toHaveBeenCalled()
    expect(pushMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=logs'))
  })
})
