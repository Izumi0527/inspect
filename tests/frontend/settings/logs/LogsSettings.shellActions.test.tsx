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

describe('LogsSettings 页面重构', () => {
  const removedExplanatoryCopies = [
    '当前页面用于统一管理日志保留策略与 Syslog 接收配置',
    '配置设备日志的自动清理策略',
    '自动清理影响后台定时清理任务',
    '开启后后端将监听设备 Syslog 上报',
    '保存并应用 Syslog 会先保存当前日志设置',
    '建议默认使用 UDP + TCP',
    '一般保持 0.0.0.0',
    '集中查看当前 Syslog 接收器状态',
    '帮助快速判断采集质量',
    '用于快速判断当前接收器最近一次异常',
    '危险操作仅用于立即清理历史日志',
    '建议在保存前再次确认当前输入值是否正确',
    '与自动清理策略共用同一保留口径',
  ]

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

  it('应展示运行摘要、分离配置动作和危险操作区', async () => {
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

    const { container } = renderWithQuery(
      <SettingsShellProvider activeTabKey="logs">
        <LogsSettings />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '日志设置' })).toBeInTheDocument()
    })

    const toolbar = within(screen.getByTestId('shell-toolbar'))
    expect(toolbar.queryByRole('button', { name: '保存更改' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '重置更改' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '保存并应用 Syslog' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '刷新运行状态' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '立即清理设备日志' })).not.toBeInTheDocument()

    expect(screen.getByText('当前运行摘要')).toBeInTheDocument()
    expect(screen.getByText('接收总量')).toBeInTheDocument()
    expect(screen.getByText('落库总量')).toBeInTheDocument()
    expect(screen.getByText('解析丢弃')).toBeInTheDocument()
    expect(screen.getAllByText('告警联动').length).toBeGreaterThan(0)

    const retentionSection = screen.getByRole('region', { name: '日志保留策略' })
    const retentionActions = within(retentionSection)
    const syslogSection = screen.getByRole('region', { name: 'Syslog 接收配置' })
    const syslogActions = within(syslogSection)
    const dangerSection = screen.getByRole('region', { name: '手动清理日志' })
    const dangerActions = within(dangerSection)

    expect(retentionActions.getByRole('button', { name: '保存更改' })).toBeInTheDocument()
    expect(retentionActions.getByRole('button', { name: '重置更改' })).toBeInTheDocument()
    expect(syslogActions.getByRole('button', { name: '保存并应用 Syslog' })).toBeInTheDocument()
    expect(syslogActions.getByRole('button', { name: '刷新运行状态' })).toBeInTheDocument()
    expect(dangerActions.getByRole('button', { name: '立即清理设备日志' })).toBeInTheDocument()

    expect(screen.getByText('运行状态')).toBeInTheDocument()
    expect(screen.getByText('实时统计')).toBeInTheDocument()
    expect(screen.getByText('最近错误')).toBeInTheDocument()
    expect(screen.queryByText(/保存并应用 Syslog 会先保存当前日志设置/)).not.toBeInTheDocument()
    expect(screen.getByText(/清理将按当前页面中的保留天数执行/)).toBeInTheDocument()
    expect(screen.getByText(/该操作不可恢复/)).toBeInTheDocument()

    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Syslog 协议' })).toBeInTheDocument()

    expect(screen.queryByText('• 有未保存的更改')).not.toBeInTheDocument()
    expect(screen.queryByText(/页面顶部工具栏/)).not.toBeInTheDocument()

    await user.click(retentionActions.getByRole('button', { name: '保存更改' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(retentionActions.getByRole('button', { name: '重置更改' }))
    expect(resetAllMock).toHaveBeenCalled()

    const initialStatusCalls = getSyslogStatusMock.mock.calls.length
    await user.click(syslogActions.getByRole('button', { name: '刷新运行状态' }))
    await waitFor(() => {
      expect(getSyslogStatusMock.mock.calls.length).toBeGreaterThan(initialStatusCalls)
    })

    await user.click(syslogActions.getByRole('button', { name: '保存并应用 Syslog' }))
    await waitFor(() => {
      expect(saveAllMock).toHaveBeenCalledTimes(2)
      expect(applySyslogConfigMock).toHaveBeenCalled()
    })

    await user.click(dangerActions.getByRole('button', { name: '立即清理设备日志' }))
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
