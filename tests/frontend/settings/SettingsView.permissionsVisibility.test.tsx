import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { SettingsView } from '@/features/settings/components/SettingsView'
import { Permission } from '@/lib/types/auth.types'

const replaceMock = jest.fn()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (perm: Permission) => perm === Permission.SYSTEM_CONFIG,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: replaceMock,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams('tab=audit'),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/settings/components/general/GeneralSettings', () => ({
  GeneralSettings: () => <div>general-settings</div>,
}))
jest.mock('@/features/settings/components/audit/AuditLogs', () => ({
  AuditLogs: () => <div>audit</div>,
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
jest.mock('@/features/settings/components/backup/BackupManagement', () => ({
  BackupManagement: () => <div>backup</div>,
}))
jest.mock('@/features/settings/components/notifications/NotificationSettings', () => ({
  NotificationSettings: () => <div>notifications</div>,
}))
jest.mock('@/features/settings/components/monitoring/MonitoringDashboard', () => ({
  MonitoringDashboard: () => <div>monitoring</div>,
}))

describe('SettingsView 权限可见性纠偏', () => {
  beforeEach(() => {
    replaceMock.mockReset()
  })

  it('URL 指向不可见 Tab 时不应渲染该 Tab，并纠正 URL', async () => {
    render(<SettingsView />)

    expect(screen.getByText('general-settings')).toBeInTheDocument()
    expect(screen.queryByText('audit')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    expect(replaceMock.mock.calls[0][0]).toEqual(expect.stringContaining('tab=general'))
  })
})

