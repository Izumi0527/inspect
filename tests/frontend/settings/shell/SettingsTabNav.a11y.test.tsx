import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScrollText, Settings } from 'lucide-react'

import { SettingsTabNav } from '@/features/settings/shell/SettingsTabNav'
import type { SettingsTabDescriptor } from '@/features/settings/types/shell.types'
import { Permission } from '@/lib/types/auth.types'

const createTab = (
  tab: Pick<SettingsTabDescriptor, 'key' | 'label' | 'icon'>
): SettingsTabDescriptor => ({
  key: tab.key,
  label: tab.label,
  icon: tab.icon,
  description: 'desc',
  requiredPermissions: [Permission.SYSTEM_CONFIG],
  kind: 'form',
  scrollMode: 'page',
  toolbarMode: 'shell',
  supportsStats: false,
  supportsLeaveGuard: false,
  component: () => <div>tab-{tab.key}</div>,
})

describe('SettingsTabNav A11y', () => {
  it('tablist 应声明 aria-orientation="horizontal"', () => {
    const onSelect = jest.fn()

    const tabs: SettingsTabDescriptor[] = [
      createTab({ key: 'general', label: '通用配置', icon: Settings }),
      createTab({ key: 'logs', label: '日志设置', icon: ScrollText }),
    ]

    render(<SettingsTabNav tabs={tabs} activeKey="general" onSelect={onSelect} />)

    const tablist = screen.getByRole('tablist', { name: '系统设置子模块' })
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('键盘左右切换焦点时，应采用 roving tabindex（聚焦项 tabIndex=0）', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()

    const tabs: SettingsTabDescriptor[] = [
      createTab({ key: 'general', label: '通用配置', icon: Settings }),
      createTab({ key: 'logs', label: '日志设置', icon: ScrollText }),
    ]

    render(<SettingsTabNav tabs={tabs} activeKey="general" onSelect={onSelect} />)

    const general = screen.getByRole('tab', { name: '通用配置' })
    const logs = screen.getByRole('tab', { name: '日志设置' })

    general.focus()
    expect(general).toHaveFocus()
    expect(general).toHaveAttribute('tabindex', '0')

    await user.keyboard('{ArrowRight}')

    expect(logs).toHaveFocus()
    expect(logs).toHaveAttribute('tabindex', '0')
    expect(general).toHaveAttribute('tabindex', '-1')
  })
})
