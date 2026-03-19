import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RoleManagement } from '@/features/settings/components/roles/RoleManagement'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'

const mockUsePermission = jest.fn()
const refetchMock = jest.fn()

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
      { id: '2', name: 'operator', displayName: '操作员', description: 'ops', isBuiltIn: true, userCount: 2, permissions: [] },
      { id: '3', name: 'custom', displayName: '自定义', description: 'x', isBuiltIn: false, userCount: 0, permissions: [] },
    ],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: refetchMock,
  }),
  useMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}))

jest.mock('@/features/settings/components/roles/RoleFormDialog', () => ({
  RoleFormDialog: (props: { open: boolean; mode: string }) => (
    <div data-testid={`role-form-dialog-${props.mode}`}>open:{String(props.open)}</div>
  ),
}))

jest.mock('@/features/settings/components/roles/RolePermissionsDialog', () => ({
  RolePermissionsDialog: (props: { open: boolean }) => (
    <div data-testid="role-permissions-dialog">open:{String(props.open)}</div>
  ),
}))

describe('RoleManagement 列表页壳层工具栏与统计迁移', () => {
  beforeEach(() => {
    mockUsePermission.mockReturnValue(true)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('统计卡与搜索/刷新/新建能力应由壳层渲染，子页不再直接渲染本地顶部区域', async () => {
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
      <SettingsShellProvider activeTabKey="roles">
        <div data-testid="page-ui">
          <RoleManagement />
        </div>
        <ShellUi />
      </SettingsShellProvider>
    )

    const pageUi = within(screen.getByTestId('page-ui'))
    const shellUi = within(screen.getByTestId('shell-ui'))

    expect(pageUi.queryByText('角色总数')).not.toBeInTheDocument()
    expect(pageUi.queryByPlaceholderText('搜索角色名称/显示名称/描述...')).not.toBeInTheDocument()
    expect(pageUi.queryByRole('button', { name: '新建角色' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(shellUi.getByText('角色总数')).toBeInTheDocument()
    })

    const searchBox = shellUi.getByRole('textbox', { name: '搜索角色' })
    await user.type(searchBox, '管理')
    expect(searchBox).toHaveValue('管理')

    await user.click(shellUi.getByRole('button', { name: '刷新' }))
    expect(refetchMock).toHaveBeenCalled()

    expect(screen.getByTestId('role-form-dialog-create')).toHaveTextContent('open:false')
    await user.click(shellUi.getByRole('button', { name: '新建角色' }))
    expect(screen.getByTestId('role-form-dialog-create')).toHaveTextContent('open:true')
  })
})

