import React from 'react'
import { render, screen } from '@testing-library/react'
import { UserManagement } from '@/features/settings/components/users/UserManagement'

const mockUseUserManagement = jest.fn()
const mockUseSettingsTabCapabilities = jest.fn()
const mockUsePermission = jest.fn()

jest.mock('@/features/settings/hooks/useUserManagement', () => ({
  useUserManagement: (...args: unknown[]) => mockUseUserManagement(...args),
}))

jest.mock('@/features/settings/hooks/useSettingsTabCapabilities', () => ({
  useSettingsTabCapabilities: (...args: unknown[]) =>
    mockUseSettingsTabCapabilities(...args),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}))

jest.mock('@/features/settings/components/users/UserFormDialog', () => ({
  UserFormDialog: () => null,
}))

jest.mock('@/features/settings/components/users/UserPasswordDialog', () => ({
  UserPasswordDialog: () => null,
}))

jest.mock('@/features/settings/components/users/UserPermissionsDialog', () => ({
  UserPermissionsDialog: () => null,
}))

jest.mock('@/features/settings/shell/SettingsConfirmDialog', () => ({
  SettingsConfirmDialog: () => null,
}))

jest.mock('@/features/settings/components/shared/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('UserManagement', () => {
  beforeEach(() => {
    mockUseSettingsTabCapabilities.mockReset()
    mockUsePermission.mockReturnValue(true)
    mockUseUserManagement.mockReturnValue({
      users: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      roles: [],
      isLoading: false,
      isRolesLoading: false,
      isDeleting: false,
      isCreating: false,
      isUpdating: false,
      isChangingPassword: false,
      updateQueryParams: jest.fn(),
      deleteUser: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      changePassword: jest.fn(),
      activateUser: jest.fn(),
      deactivateUser: jest.fn(),
      lockUser: jest.fn(),
      unlockUser: jest.fn(),
      stats: {
        totalUsers: 3,
        activeUsers: 3,
        inactiveUsers: 0,
        lockedUsers: 0,
      },
      error: null,
    })
  })

  it('将搜索与添加动作注册到外壳工具栏，并移除卡片内本地工具栏', () => {
    render(<UserManagement />)

    const capabilities = mockUseSettingsTabCapabilities.mock.calls[0][1]
    expect(capabilities.headerLayout).toBe('inline')
    expect(capabilities.toolbar.search.placeholder).toBe('搜索用户名、邮箱...')
    expect(capabilities.toolbar.layout).toBe('end')
    expect(capabilities.primaryActions[0].label).toBe('添加用户')

    expect(
      screen.queryByRole('button', { name: '添加用户' })
    ).not.toBeInTheDocument()
  })
})
