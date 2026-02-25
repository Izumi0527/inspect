import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsView } from '@/features/settings/components/SettingsView'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams('tab=logs'),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/settings/components/general/GeneralSettings', () => ({
  GeneralSettings: () => <div>general-settings</div>,
}))

jest.mock('@/features/settings/components/users/UserManagement', () => ({
  UserManagement: () => <div>users</div>,
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

jest.mock('@/features/settings/components/logs/LogsSettings', () => ({
  LogsSettings: () => <div>logs-settings</div>,
}))

describe('SettingsView 日志设置标签页', () => {
  it('当 URL 参数 tab=logs 时，应默认展示日志设置标签页内容', () => {
    render(<SettingsView />)

    expect(screen.getByText('logs-settings')).toBeInTheDocument()
    expect(screen.queryByText('general-settings')).not.toBeInTheDocument()
  })
})
