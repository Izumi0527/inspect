import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

describe('MonitoringDashboard 壳层状态与动作上报', () => {
  beforeEach(() => {
    mockUseSystemMonitoring.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('正常状态下应上报刷新与暂停刷新动作，且不展示刷新失败横幅', async () => {
    mockUseSystemMonitoring.mockReturnValue({
      metrics: {
        cpu: { usage: 12.3, cores: 4, temperature: 55 },
        memory: { usage: 45.6, used: 1024, total: 2048 },
        disk: { usage: 78.9, used: 100, total: 200 },
        network: {
          bytesReceived: 1,
          bytesSent: 2,
          packetsReceived: 3,
          packetsSent: 4,
        },
      },
      services: [],
      system: undefined,
      history: undefined,
      timestamp: 1710000000,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    })

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

    await waitFor(() => {
      const refreshButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
        name: '刷新',
      })
      expect(refreshButton).toBeInTheDocument()
      expect(refreshButton).toBeEnabled()
    })
    const pauseButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
      name: '暂停刷新',
    })
    expect(pauseButton).toBeInTheDocument()
    expect(pauseButton).toBeEnabled()
    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument()

    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
  })

  it('刷新失败但仍有旧数据时，应向壳层上报横幅与重试/暂停刷新动作', async () => {
    mockUseSystemMonitoring.mockReturnValue({
      metrics: {
        cpu: { usage: 12.3, cores: 4, temperature: 55 },
        memory: { usage: 45.6, used: 1024, total: 2048 },
        disk: { usage: 78.9, used: 100, total: 200 },
        network: {
          bytesReceived: 1,
          bytesSent: 2,
          packetsReceived: 3,
          packetsSent: 4,
        },
      },
      services: [],
      system: undefined,
      history: undefined,
      timestamp: 1710000000,
      isLoading: false,
      error: new Error('boom'),
      refetch: refetchMock,
    })

    const user = userEvent.setup()

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

    await waitFor(() => {
      const retryButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
        name: '重试',
      })
      expect(retryButton).toBeInTheDocument()
      expect(retryButton).toBeEnabled()
    })
    const pauseButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
      name: '暂停刷新',
    })
    expect(pauseButton).toBeInTheDocument()
    expect(pauseButton).toBeEnabled()

    expect(screen.getByText('刷新失败')).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()

    await user.click(
      within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '重试' })
    )
    expect(refetchMock).toHaveBeenCalled()

    await user.click(
      within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '暂停刷新' })
    )
    await waitFor(() => {
      const resumeButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
        name: '恢复刷新',
      })
      expect(resumeButton).toBeInTheDocument()
      expect(resumeButton).toBeEnabled()
    })

    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
    expect(mockUseSystemMonitoring).toHaveBeenLastCalledWith(false)
  })

  it('后台刷新时应禁用刷新动作，但仍允许暂停/恢复自动刷新', async () => {
    mockUseSystemMonitoring.mockReturnValue({
      metrics: {
        cpu: { usage: 12.3, cores: 4, temperature: 55 },
        memory: { usage: 45.6, used: 1024, total: 2048 },
        disk: { usage: 78.9, used: 100, total: 200 },
        network: {
          bytesReceived: 1,
          bytesSent: 2,
          packetsReceived: 3,
          packetsSent: 4,
        },
      },
      services: [],
      system: undefined,
      history: undefined,
      timestamp: 1710000000,
      isLoading: true,
      error: null,
      refetch: refetchMock,
    })

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

    await waitFor(() => {
      const refreshButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
        name: '刷新',
      })
      expect(refreshButton).toBeInTheDocument()
      expect(refreshButton).toBeDisabled()
    })

    const pauseButton = within(screen.getByTestId('shell-toolbar')).getByRole('button', {
      name: '暂停刷新',
    })
    expect(pauseButton).toBeInTheDocument()
    expect(pauseButton).toBeEnabled()

    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument()
    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
  })
})
