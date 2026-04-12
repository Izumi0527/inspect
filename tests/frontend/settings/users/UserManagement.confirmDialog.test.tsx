import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserManagement } from '@/features/settings/components/users/UserManagement'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'

const mockUseUserManagement = jest.fn()
const mockUsePermission = jest.fn()

const deleteUserMock = jest.fn()

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
  UserFormDialog: () => <div data-testid="user-form-dialog" />,
}))

jest.mock('@/features/settings/components/users/UserPasswordDialog', () => ({
  UserPasswordDialog: () => <div data-testid="user-password-dialog" />,
}))

jest.mock('@/features/settings/components/users/UserPermissionsDialog', () => ({
  UserPermissionsDialog: () => <div data-testid="user-permissions-dialog" />,
}))

describe('UserManagement 危险操作确认', () => {
  beforeEach(() => {
    mockUsePermission.mockReturnValue(true)
    mockUseUserManagement.mockReturnValue({
      users: [
        {
          id: 'u1',
          username: 'alice',
          email: 'alice@example.com',
          status: 'active',
          roles: ['admin'],
          createdAt: '2026-03-01T00:00:00Z',
          lastLoginAt: null,
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 10,
      stats: null,
      roles: [],
      isLoading: false,
      isRolesLoading: false,
      isDeleting: false,
      isCreating: false,
      isUpdating: false,
      isChangingPassword: false,
      updateQueryParams: jest.fn(),
      deleteUser: deleteUserMock.mockResolvedValue(undefined),
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

  it('应使用对话框确认删除：取消不触发，确认才触发', async () => {
    const user = userEvent.setup()

    render(
      <SettingsShellProvider activeTabKey="users">
        <UserManagement />
      </SettingsShellProvider>
    )

    await user.click(screen.getByTitle('更多操作'))
    await user.click(screen.getByRole('menuitem', { name: '删除用户' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteUserMock).not.toHaveBeenCalled()

    await user.click(screen.getByTitle('更多操作'))
    await user.click(screen.getByRole('menuitem', { name: '删除用户' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledWith('u1')
    })
  })
})