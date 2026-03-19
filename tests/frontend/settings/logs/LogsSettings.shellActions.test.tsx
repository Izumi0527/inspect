import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LogsSettings } from '@/features/settings/components/logs/LogsSettings'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseLogsSettings = jest.fn()
const saveAllMock = jest.fn()
const resetAllMock = jest.fn()

const getSyslogStatusMock = jest.fn()
const applySyslogConfigMock = jest.fn()
const cleanupDeviceLogsMock = jest.fn()

jest.mock('@/features/settings/hooks/useLogsSettings', () => ({
  useLogsSettings: () => mockUseLogsSettings(),
}))

jest.mock('@/features/settings/api/logs.api', () => ({
  logsSettingsApi: {
    getSyslogStatus: (...args: unknown[]) => getSyslogStatusMock(...args),
    applySyslogConfig: (...args: unknown[]) => applySyslogConfigMock(...args),
    cleanupDeviceLogs: (...args: unknown[]) => cleanupDeviceLogsMock(...args),
  },
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

const renderWithQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LogsSettings 壳层动作区迁移', () => {
  beforeEach(() => {
    mockUseLogsSettings.mockReturnValue({
      retentionDays: 90,
      autoCleanupEnabled: true,
      syslogEnabled: true,
      syslogProtocol: 'both',
      syslogHost: '0.0.0.0',
      syslogPort: 5514,
      syslogMaxMessageBytes: 8192,
      syslogAlertsEnabled: true,
      syslogAlertsMaxNewPerMinute: 30,
      isLoading: false,
      isSaving: false,
      isDirty: true,
      error: null,
      updateRetentionDays: jest.fn(),
      updateAutoCleanupEnabled: jest.fn(),
      updateSyslogEnabled: jest.fn(),
      updateSyslogProtocol: jest.fn(),
      updateSyslogHost: jest.fn(),
      updateSyslogPort: jest.fn(),
      updateSyslogMaxMessageBytes: jest.fn(),
      updateSyslogAlertsEnabled: jest.fn(),
      updateSyslogAlertsMaxNewPerMinute: jest.fn(),
      saveAll: saveAllMock.mockResolvedValue(undefined),
      resetAll: resetAllMock,
    })

    getSyslogStatusMock.mockResolvedValue({
      running: true,
      config: {
        enabled: true,
        protocol: 'both',
        host: '0.0.0.0',
        port: 5514,
        maxMessageBytes: 8192,
        alertsEnabled: true,
        alertsMaxNewPerMinute: 30,
      },
      received: 1,
      stored: 1,
      droppedUnmatched: 0,
      droppedParse: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsRateLimited: 0,
    })
    applySyslogConfigMock.mockResolvedValue({
      running: true,
      config: {
        enabled: true,
        protocol: 'both',
        host: '0.0.0.0',
        port: 5514,
        maxMessageBytes: 8192,
        alertsEnabled: true,
        alertsMaxNewPerMinute: 30,
      },
      received: 1,
      stored: 1,
      droppedUnmatched: 0,
      droppedParse: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsRateLimited: 0,
    })
    cleanupDeviceLogsMock.mockResolvedValue({ deletedCount: 3 })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应通过壳层上报保存/应用/刷新/清理动作，并使用对话框确认清理', async () => {
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
        </div>
      )
    }

    renderWithQuery(
      <SettingsShellProvider activeTabKey="logs">
        <LogsSettings />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(within(screen.getByTestId('shell-toolbar')).getByRole('button', { name: '保存' })).toBeInTheDocument()
    })

    const toolbar = within(screen.getByTestId('shell-toolbar'))
    expect(toolbar.getByRole('button', { name: '重置' })).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '应用配置' })).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '刷新状态' })).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '立即清理' })).toBeInTheDocument()

    // 不应继续渲染旧的 ActionButtons 提示文本
    expect(screen.queryByText('• 有未保存的更改')).not.toBeInTheDocument()

    await user.click(toolbar.getByRole('button', { name: '保存' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(toolbar.getByRole('button', { name: '重置' }))
    expect(resetAllMock).toHaveBeenCalled()

    const initialStatusCalls = getSyslogStatusMock.mock.calls.length
    await user.click(toolbar.getByRole('button', { name: '刷新状态' }))
    await waitFor(() => {
      expect(getSyslogStatusMock.mock.calls.length).toBeGreaterThan(initialStatusCalls)
    })

    await user.click(toolbar.getByRole('button', { name: '应用配置' }))
    await waitFor(() => {
      expect(applySyslogConfigMock).toHaveBeenCalled()
    })

    await user.click(toolbar.getByRole('button', { name: '立即清理' }))
    expect(cleanupDeviceLogsMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '继续清理' }))

    await waitFor(() => {
      expect(cleanupDeviceLogsMock).toHaveBeenCalledWith({ retentionDays: 90 })
    })
  })
})
