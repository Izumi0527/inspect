import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuditLogs } from '@/features/settings/components/audit/AuditLogs'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'

const mockUseAuditLogs = jest.fn()
const exportLogsMock = jest.fn()
const updateQueryParamsMock = jest.fn()
const refetchMock = jest.fn()

jest.mock('@/features/settings/hooks/useAuditLogs', () => ({
  useAuditLogs: () => mockUseAuditLogs(),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('AuditLogs 列表页壳层工具栏与统计迁移', () => {
  beforeEach(() => {
    mockUseAuditLogs.mockReturnValue({
      logs: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      stats: {
        totalLogs: 100,
        todayLogs: 10,
        successRate: 0.9,
      },
      isLoading: false,
      error: null,
      refetch: refetchMock,
      updateQueryParams: updateQueryParamsMock,
      exportLogs: exportLogsMock.mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('统计卡与搜索/导出能力应由壳层渲染，子页不再直接渲染本地顶部区域', async () => {
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
      <SettingsShellProvider activeTabKey="audit">
        <div data-testid="page-ui">
          <AuditLogs />
        </div>
        <ShellUi />
      </SettingsShellProvider>
    )

    const pageUi = within(screen.getByTestId('page-ui'))
    const shellUi = within(screen.getByTestId('shell-ui'))

    expect(pageUi.queryByText('总日志数')).not.toBeInTheDocument()
    expect(pageUi.queryByPlaceholderText('搜索日志...')).not.toBeInTheDocument()
    expect(pageUi.queryByRole('button', { name: '导出日志' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(shellUi.getByText('总日志数')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(shellUi.getByRole('button', { name: '刷新' })).toBeInTheDocument()
      expect(shellUi.getByRole('button', { name: '导出日志' })).toBeInTheDocument()
    })

    await user.type(shellUi.getByRole('textbox', { name: '搜索审计日志' }), 'error{enter}')
    await waitFor(() => {
      expect(updateQueryParamsMock).toHaveBeenCalledWith({ keyword: 'error', page: 1 })
    })

    await user.click(shellUi.getByRole('button', { name: '刷新' }))
    expect(refetchMock).toHaveBeenCalled()

    await user.click(shellUi.getByRole('button', { name: '导出日志' }))
    expect(exportLogsMock).toHaveBeenCalled()
  })
})
