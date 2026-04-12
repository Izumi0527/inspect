import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RoleManagement } from '@/features/settings/components/roles/RoleManagement'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'

const mockUsePermission = jest.fn()
const deleteRoleMock = jest.fn()

let mutationCallIndex = 0

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: unknown) => mockUsePermission(permission),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
  useQuery: () => ({
    data: [
      { id: '1', name: 'admin', displayName: '管理员', description: '', isBuiltIn: true, userCount: 1, permissions: [] },
      { id: '3', name: 'custom', displayName: '自定义', description: 'x', isBuiltIn: false, userCount: 0, permissions: [] },
    ],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  }),
  useMutation: () => {
    mutationCallIndex += 1
    const isDeleteMutation = mutationCallIndex % 3 === 0
    if (isDeleteMutation) {
      return { isPending: false, mutateAsync: deleteRoleMock }
    }
    return { isPending: false, mutateAsync: jest.fn() }
  },
}))

jest.mock('@/features/settings/components/roles/RoleFormDialog', () => ({
  RoleFormDialog: () => <div data-testid="role-form-dialog" />,
}))

jest.mock('@/features/settings/components/roles/RolePermissionsDialog', () => ({
  RolePermissionsDialog: () => <div data-testid="role-permissions-dialog" />,
}))

describe('RoleManagement 危险操作确认', () => {
  beforeEach(() => {
    mockUsePermission.mockReturnValue(true)
    mutationCallIndex = 0
    deleteRoleMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应使用对话框确认删除：取消不触发，确认才触发', async () => {
    const user = userEvent.setup()

    render(
      <SettingsShellProvider activeTabKey="roles">
        <RoleManagement />
      </SettingsShellProvider>
    )

    await user.click(screen.getByLabelText('更多操作 自定义'))
    await user.click(screen.getByRole('menuitem', { name: '删除角色' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteRoleMock).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('更多操作 自定义'))
    await user.click(screen.getByRole('menuitem', { name: '删除角色' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteRoleMock).toHaveBeenCalledWith('3')
    })
  })
})