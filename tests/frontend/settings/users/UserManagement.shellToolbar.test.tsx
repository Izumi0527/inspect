import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserManagement } from '@/features/settings/components/users/UserManagement'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'

const mockUseUserManagement = jest.fn()
const mockUsePermission = jest.fn()

const updateQueryParamsMock = jest.fn()

jest.mock('@/features/settings/hooks/useUserManagement', () => ({
  useUserManagement: () => mockUseUserManagement(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: unknown) => mockUsePermission(permission),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/settings/components/users/UserFormDialog', () => ({
  UserFormDialog: (props: { open: boolean; mode: string }) => (
    <div data-testid={`user-form-dialog-${props.mode}`}>open:{String(props.open)}</div>
  ),
}))

jest.mock('@/features/settings/components/users/UserPasswordDialog', () => ({
  UserPasswordDialog: (props: { open: boolean }) => (
    <div data-testid="user-password-dialog">open:{String(props.open)}</div>
  ),
}))

jest.mock('@/features/settings/components/users/UserPermissionsDialog', () => ({
  UserPermissionsDialog: (props: { open: boolean }) => (
    <div data-testid="user-permissions-dialog">open:{String(props.open)}</div>
  ),
}))

describe('UserManagement 列表页壳层工具栏与统计迁移', () => {
  beforeEach(() => {
    mockUsePermission.mockReturnValue(true)
    mockUseUserManagement.mockReturnValue({
      users: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      stats: {
        totalUsers: 10,
        activeUsers: 8,
        inactiveUsers: 1,
        lockedUsers: 1,
      },
      roles: [],
      isLoading: false,
      isRolesLoading: false,
      isDeleting: false,
      isCreating: false,
      isUpdating: false,
      isChangingPassword: false,
      updateQueryParams: updateQueryParamsMock,
      deleteUser: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      changePassword: jest.fn(),
      activateUser: jest.fn(),
      deactivateUser: jest.fn(),
      lockUser: jest.fn(),
      unlockUser: jest.fn(),
      error: null,
      rolesError: null,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('统计卡与搜索/新增能力应由壳层渲染，子页不再直接渲染本地顶部区域', async () => {
    const user = userEvent.setup()

    const ShellUi: React.FC = () => {
      const { activeTabCapabilities } = useSettingsShellState()
      return (
        <div data-testid="shell-ui">
          <SettingsStatsStrip stats={activeTabCapabilities?.stats ?? []} />
          <SettingsToolbar
            toolbar={activeTabCapabilities?.toolbar}
            primaryActions={activeTabCapabilities?.primaryActions}
            secondaryActions={activeTabCapabilities?.secondaryActions}
          />
        </div>
      )
    }

    render(
      <SettingsShellProvider activeTabKey="users">
        <div data-testid="page-ui">
          <UserManagement />
        </div>
        <ShellUi />
      </SettingsShellProvider>
    )

    const pageUi = within(screen.getByTestId('page-ui'))
    const shellUi = within(screen.getByTestId('shell-ui'))

    expect(pageUi.queryByText('总用户数')).not.toBeInTheDocument()
    expect(pageUi.queryByPlaceholderText('搜索用户名、邮箱...')).not.toBeInTheDocument()
    expect(pageUi.queryByRole('button', { name: '添加用户' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(shellUi.getByText('总用户数')).toBeInTheDocument()
    })

    expect(shellUi.getByRole('textbox', { name: '搜索用户' })).toBeInTheDocument()
    expect(shellUi.getByRole('button', { name: '添加用户' })).toBeInTheDocument()

    await user.type(shellUi.getByRole('textbox', { name: '搜索用户' }), 'alice{enter}')
    await waitFor(() => {
      expect(updateQueryParamsMock).toHaveBeenCalledWith({ keyword: 'alice', page: 1 })
    })

    expect(screen.getByTestId('user-form-dialog-create')).toHaveTextContent('open:false')
    await user.click(shellUi.getByRole('button', { name: '添加用户' }))
    expect(screen.getByTestId('user-form-dialog-create')).toHaveTextContent('open:true')
  })
})

