import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Settings, ScrollText } from 'lucide-react'
import { SettingsTabNav } from '@/features/settings/shell/SettingsTabNav'
import type { SettingsTabDescriptor } from '@/features/settings/types/shell.types'
import { Permission } from '@/lib/types/auth.types'

const createTab = (
  tab: Pick<SettingsTabDescriptor, 'key' | 'label' | 'icon'> &
    Partial<Pick<SettingsTabDescriptor, 'description' | 'scrollMode'>>
): SettingsTabDescriptor => ({
  key: tab.key,
  label: tab.label,
  icon: tab.icon,
  description: tab.description ?? 'desc',
  requiredPermissions: [Permission.SYSTEM_CONFIG],
  kind: 'form',
  scrollMode: tab.scrollMode ?? 'page',
  toolbarMode: 'shell',
  supportsStats: false,
  supportsLeaveGuard: false,
  component: () => <div>tab-{tab.key}</div>,
})

describe('SettingsTabNav', () => {
  it('应提供 tablist/tab 语义，并正确标记 aria-selected 与 aria-controls', () => {
    const tabs: SettingsTabDescriptor[] = [
      createTab({ key: 'general', label: '通用配置', icon: Settings }),
      createTab({ key: 'logs', label: '日志设置', icon: ScrollText }),
    ]

    render(
      <SettingsTabNav
        tabs={tabs}
        activeKey="general"
        onSelect={() => {}}
      />
    )

    expect(screen.getByRole('tablist')).toBeInTheDocument()

    const general = screen.getByRole('tab', { name: '通用配置' })
    const logs = screen.getByRole('tab', { name: '日志设置' })

    expect(general).toHaveAttribute('aria-selected', 'true')
    expect(general).toHaveAttribute('aria-controls', 'settings-panel-general')

    expect(logs).toHaveAttribute('aria-selected', 'false')
    expect(logs).toHaveAttribute('aria-controls', 'settings-panel-logs')
  })

  it('点击非激活 Tab 应触发 onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()

    const tabs: SettingsTabDescriptor[] = [
      createTab({ key: 'general', label: '通用配置', icon: Settings }),
      createTab({ key: 'logs', label: '日志设置', icon: ScrollText }),
    ]

    render(
      <SettingsTabNav
        tabs={tabs}
        activeKey="general"
        onSelect={onSelect}
      />
    )

    await user.click(screen.getByRole('tab', { name: '日志设置' }))

    expect(onSelect).toHaveBeenCalledWith('logs')
  })
})

