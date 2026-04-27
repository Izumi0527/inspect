import React from 'react'
import { render } from '@testing-library/react'
import { RoleManagement } from '@/features/settings/components/roles/RoleManagement'

const mockUseSettingsTabCapabilities = jest.fn()
const mockUsePermission = jest.fn()
const mockUseQuery = jest.fn()
const mockUseMutation = jest.fn()
const mockUseQueryClient = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: (...args: unknown[]) => mockUseQueryClient(...args),
}))

jest.mock('@/features/settings/hooks/useSettingsTabCapabilities', () => ({
  useSettingsTabCapabilities: (...args: unknown[]) =>
    mockUseSettingsTabCapabilities(...args),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}))

jest.mock('@/features/settings/components/roles/RoleFormDialog', () => ({
  RoleFormDialog: () => null,
}))

jest.mock('@/features/settings/components/roles/RolePermissionsDialog', () => ({
  RolePermissionsDialog: () => null,
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

describe('RoleManagement', () => {
  beforeEach(() => {
    mockUseSettingsTabCapabilities.mockReset()
    mockUsePermission.mockReturnValue(true)
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    })
    mockUseQuery.mockReturnValue({
      data: [
        {
          id: 'admin',
          name: 'admin',
          displayName: '管理员',
          description: '系统管理员',
          isBuiltIn: true,
          userCount: 2,
          permissions: [],
          createdAt: '2026-04-23T00:00:00Z',
          updatedAt: '2026-04-23T00:00:00Z',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    })
  })

  it('向外壳注册与用户管理一致的头部布局', () => {
    render(<RoleManagement />)

    const capabilities = mockUseSettingsTabCapabilities.mock.calls[0][1]
    expect(capabilities.headerLayout).toBe('inline')
    expect(capabilities.toolbar.layout).toBe('end')
    expect(capabilities.primaryActions[0].label).toBe('新建角色')
    expect(capabilities.secondaryActions[0].label).toBe('刷新')
  })
})
