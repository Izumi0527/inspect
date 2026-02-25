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
  useSearchParams: () => new URLSearchParams('tab=monitoring'),
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
  MonitoringDashboard: () => <div>monitoring-dashboard</div>,
}))

describe('SettingsView 标签页参数', () => {
  it('当 URL 参数 tab=monitoring 时，应默认展示系统监控标签页内容', () => {
    render(<SettingsView />)

    expect(screen.getByText('monitoring-dashboard')).toBeInTheDocument()
    expect(screen.queryByText('general-settings')).not.toBeInTheDocument()
  })
})

