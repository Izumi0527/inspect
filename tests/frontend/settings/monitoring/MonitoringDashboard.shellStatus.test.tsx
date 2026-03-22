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

describe('MonitoringDashboard 壳层状态与动作上报', () => {
  beforeEach(() => {
    mockUseSystemMonitoring.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('正常状态下应移除壳层刷新动作，并保持自动刷新开启', async () => {
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
      expect(screen.getByText('网络流量')).toBeInTheDocument()
    })
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '暂停刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '恢复刷新' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument()

    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
  })

  it('刷新失败但仍有旧数据时，应仅上报失败横幅，且不再暴露重试或暂停刷新按钮', async () => {
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
      expect(screen.getByText('刷新失败')).toBeInTheDocument()
    })
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '重试' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '暂停刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '恢复刷新' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('刷新失败')).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()

    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
  })

  it('后台刷新时应继续移除壳层按钮，并保持自动刷新开启', async () => {
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
      expect(screen.getByText('网络流量')).toBeInTheDocument()
    })
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '暂停刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '恢复刷新' })
    ).not.toBeInTheDocument()

    expect(screen.queryByText('刷新失败')).not.toBeInTheDocument()
    expect(mockUseSystemMonitoring).toHaveBeenCalledWith(true)
  })
})
