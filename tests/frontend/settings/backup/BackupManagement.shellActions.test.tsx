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
  BackupConfigSection: () => <div>backup-config-section</div>,
}))
jest.mock('@/features/settings/components/backup/BackupHistorySection', () => ({
  BackupHistorySection: () => <div>backup-history-section</div>,
}))

describe('BackupManagement 壳层动作区迁移', () => {
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

  it('不应直接渲染 ActionButtons，且应向壳层上报保存/重置与离开拦截能力', async () => {
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
      expect(within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '保存' })).toBeInTheDocument()
    })
    expect(within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '重置' })).toBeInTheDocument()
    expect(screen.queryByText('• 有未保存的更改')).not.toBeInTheDocument()

    expect(screen.getByTestId('shell-caps')).toHaveTextContent('dirty:true')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('saving:false')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('blockLeave:true')

    await user.click(within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '保存' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '重置' }))
    expect(resetAllMock).toHaveBeenCalled()
  })
})

