import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BackupHistorySection } from '@/features/settings/components/backup/BackupHistorySection'
import type { BackupRecord } from '@/features/settings/types/backup.types'

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('BackupHistorySection 危险操作确认', () => {
  const backup: BackupRecord = {
    id: 'b1',
    fileName: 'backup-2026-03-01.zip',
    filePath: '/tmp/backup-2026-03-01.zip',
    fileSize: 1024,
    backupType: 'manual',
    status: 'success',
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: 'admin',
    duration: 3,
  }

  const diskUsage = {
    used: 1024,
    total: 1024 * 1024,
    percentage: 0.1,
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('恢复备份/删除备份应使用对话框确认：取消不触发，确认才触发', async () => {
    const user = userEvent.setup()

    const onRestoreBackup = jest.fn().mockResolvedValue(undefined)
    const onDeleteBackup = jest.fn().mockResolvedValue(undefined)

    render(
      <BackupHistorySection
        backups={[backup]}
        totalCount={1}
        diskUsage={diskUsage}
        isCreating={false}
        isDeleting={false}
        onCreateBackup={jest.fn()}
        onDownloadBackup={jest.fn()}
        onRestoreBackup={onRestoreBackup}
        onDeleteBackup={onDeleteBackup}
      />
    )

    // 恢复：取消
    await user.click(screen.getByTitle('恢复备份'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onRestoreBackup).not.toHaveBeenCalled()

    // 恢复：确认
    await user.click(screen.getByTitle('恢复备份'))
    await user.click(screen.getByRole('button', { name: '确认恢复' }))
    await waitFor(() => {
      expect(onRestoreBackup).toHaveBeenCalledWith('b1')
    })

    // 删除：取消
    await user.click(screen.getByTitle('删除备份'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDeleteBackup).not.toHaveBeenCalled()

    // 删除：确认
    await user.click(screen.getByTitle('删除备份'))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(onDeleteBackup).toHaveBeenCalledWith('b1')
    })
  })
})