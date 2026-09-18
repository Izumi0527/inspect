import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BackupManagement } from '@/features/settings/components/backup/BackupManagement'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseBackupManagement = jest.fn()
const saveAllMock = jest.fn()
const resetAllMock = jest.fn()

jest.mock('@/features/settings/hooks/useBackupManagement', () => ({
  useBackupManagement: () => mockUseBackupManagement(),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/settings/components/backup/BackupConfigSection', () => ({
  BackupConfigSection: (props: {
    actions?: {
      isDirty: boolean
      isSaving: boolean
      onSave: () => void
      onReset: () => void
    }
  }) => (
    <div>
      <div>backup-config-section</div>
      {props.actions ? (
        <div role="group" aria-label="备份策略操作">
          <button
            type="button"
            onClick={props.actions.onReset}
            disabled={!props.actions.isDirty || props.actions.isSaving}
          >
            重置整页更改
          </button>
          <button
            type="button"
            onClick={props.actions.onSave}
            disabled={!props.actions.isDirty || props.actions.isSaving}
          >
            {props.actions.isSaving ? '保存中...' : '保存整页更改'}
          </button>
        </div>
      ) : (
        <div>no-local-actions</div>
      )}
    </div>
  ),
}))
jest.mock('@/features/settings/components/backup/BackupHistorySection', () => ({
  BackupHistorySection: () => <div>backup-history-section</div>,
}))

describe('BackupManagement 壳层动作区迁移', () => {
  const removedExplanatoryCopies = [
    '保存整页更改会提交当前备份策略配置',
  ]

  beforeEach(() => {
    mockUseBackupManagement.mockReturnValue({
      config: { includeDatabase: true, includeFiles: false },
      backups: [],
      totalCount: 0,
      diskUsage: { used: 0, free: 0, total: 0 },
      isLoading: false,
      isSaving: false,
      isCreating: false,
      isRestoring: false,
      isDeleting: false,
      isDirty: true,
      error: null,
      updateConfig: jest.fn(),
      saveAll: saveAllMock.mockResolvedValue(undefined),
      resetAll: resetAllMock,
      createBackup: jest.fn(),
      restoreBackup: jest.fn(),
      deleteBackup: jest.fn(),
      downloadBackup: jest.fn(),
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应展示备份摘要，并将整页保存动作下移到备份策略模块标题行', async () => {
    const user = userEvent.setup()

    const ShellToolbar: React.FC = () => {
      const { activeTabCapabilities } = useSettingsShellState()
      return (
        <div data-testid="shell-toolbar">
          <SettingsToolbar
            toolbar={activeTabCapabilities?.toolbar}
            primaryActions={activeTabCapabilities?.primaryActions}
            secondaryActions={activeTabCapabilities?.secondaryActions}
          />
          <div data-testid="shell-caps">
            dirty:{String(activeTabCapabilities?.dirty)};saving:{String(
              activeTabCapabilities?.saving
            )}
            ;blockLeave:{String(activeTabCapabilities?.blockLeave)}
          </div>
        </div>
      )
    }

    render(
      <SettingsShellProvider activeTabKey="backup">
        <BackupManagement />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('backup-config-section')).toBeInTheDocument()
    })
    // 策略配置与历史记录在宽屏下左右两栏并排，历史记录含 8 列表格故占更宽一侧
    const configSection = screen.getByText('backup-config-section').parentElement
    const historySection = screen.getByText('backup-history-section')
    expect(configSection?.parentElement).toBe(historySection.parentElement)
    expect(historySection.parentElement).toHaveClass('xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')
    expect(configSection?.nextElementSibling).toBe(historySection)
    expect(screen.queryByRole('heading', { name: '备份管理' })).not.toBeInTheDocument()
    // 顶部概览卡与表单/历史记录信息重复，已整体移除
    expect(screen.queryByRole('region', { name: '备份管理概览' })).not.toBeInTheDocument()
    expect(screen.queryByText('当前备份健康度')).not.toBeInTheDocument()
    expect(screen.queryByText('备份总数')).not.toBeInTheDocument()
    expect(screen.queryByText('磁盘使用率')).not.toBeInTheDocument()
    expect(screen.queryByText('最近备份状态')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '保存整页更改' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '重置整页更改' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '备份策略操作' })).toBeInTheDocument()
    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    expect(screen.getByTestId('shell-caps')).toHaveTextContent('dirty:true')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('saving:false')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('blockLeave:true')

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(resetAllMock).toHaveBeenCalled()
  })
})

