import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingsConfirmDialog } from '@/features/settings/shell/SettingsConfirmDialog'

describe('SettingsConfirmDialog', () => {
  it('应展示标题与描述，并支持确认/取消回调', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    const onOpenChange = jest.fn()

    render(
      <SettingsConfirmDialog
        open
        tone="danger"
        title="确认清理"
        description="此操作不可撤销"
        confirmText="继续清理"
        cancelText="取消"
        confirmLoading={false}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('确认清理')).toBeInTheDocument()
    expect(screen.getByText('此操作不可撤销')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '继续清理' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
