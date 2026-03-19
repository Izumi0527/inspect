import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'

import { MonitoringDashboard } from '@/features/settings/components/monitoring/MonitoringDashboard'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsStatusBannerStack } from '@/features/settings/shell/SettingsStatusBannerStack'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseSystemMonitoring = jest.fn()
const refetchMock = jest.fn()

jest.mock('@/features/settings/hooks/useSystemMonitoring', () => ({
  useSystemMonitoring: (...args: unknown[]) => mockUseSystemMonitoring(...args),
}))

describe('MonitoringDashboard 错误态', () => {
  beforeEach(() => {
    mockUseSystemMonitoring.mockReturnValue({
      metrics: undefined,
      services: [],
      system: undefined,
      history: undefined,
      timestamp: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch: refetchMock,
    })
  })

  it('加载失败（无旧数据）时，应展示内容区错误态，但不展示刷新失败横幅', async () => {
    const ShellFrame: React.FC = () => {
      const { activeTabCapabilities } = useSettingsShellState()
      return (
        <div>
          <SettingsStatusBannerStack banners={activeTabCapabilities?.banners ?? []} />
          <div data-testid="shell-toolbar">
            <SettingsToolbar
              toolbar={activeTabCapabilities?.toolbar}
              primaryActions={activeTabCapabilities?.primaryActions}
              secondaryActions={activeTabCapabilities?.secondaryActions}
            />
          </div>
        </div>
      )
    }

    render(
      <SettingsShellProvider activeTabKey="monitoring">
        <MonitoringDashboard />
        <ShellFrame />
      </SettingsShellProvider>
    )

    expect(screen.getByText('加载监控数据失败')).toBeInTheDocument()
    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument()

    await waitFor(() => {
      const retryButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
        name: '重试',
      })
      expect(retryButton).toBeInTheDocument()
      expect(retryButton).toBeEnabled()
    })
  })
})
