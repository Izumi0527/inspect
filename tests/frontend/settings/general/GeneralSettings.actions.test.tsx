import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

const mockUseGeneralSettings = jest.fn()
const saveAllMock = jest.fn()
const resetAllMock = jest.fn()

jest.mock('@/features/settings/hooks/useGeneralSettings', () => ({
  useGeneralSettings: () => mockUseGeneralSettings(),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/settings/components/general/BasicInfoSection', () => ({
  BasicInfoSection: (props: {
    actions?: {
      isDirty: boolean
      isSaving: boolean
      onSave: () => void
      onReset: () => void
    }
  }) => (
    <div>
      {props.actions ? (
        <div>
          <button
            type="button"
            disabled={!props.actions.isDirty || props.actions.isSaving}
            onClick={props.actions.onReset}
          >
            重置整页更改
          </button>
          <button
            type="button"
            disabled={!props.actions.isDirty || props.actions.isSaving}
            onClick={props.actions.onSave}
          >
            {props.actions.isSaving ? '保存中...' : '保存整页更改'}
          </button>
        </div>
      ) : null}
    </div>
  ),
}))

jest.mock('@/features/settings/components/general/InspectionConfigSection', () => ({
  InspectionConfigSection: () => <div>inspection-config-section</div>,
}))

jest.mock('@/features/settings/components/general/ReportConfigSection', () => ({
  ReportConfigSection: () => <div>report-config-section</div>,
}))

jest.mock('@/features/settings/components/general/UserPreferenceSection', () => ({
  UserPreferenceSection: () => <div>user-preference-section</div>,
}))

describe('GeneralSettings 通用配置页操作按钮', () => {
  beforeEach(() => {
    mockUseGeneralSettings.mockReturnValue({
      basicInfo: {
        applicationName: '网络设备巡检系统',
        version: '1.0.0',
        timezone: 'Asia/Shanghai',
      },
      inspectionConfig: {
        maxConcurrentTasks: 10,
        defaultTimeout: 30,
        retryAttempts: 3,
      },
      reportConfig: {
        defaultFormat: 'excel',
        maxExportRecords: 10000,
      },
      userPreference: {
        theme: 'auto',
        language: 'zh-CN',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
      },
      isLoading: false,
      isSaving: false,
      isDirty: true,
      error: null,
      updateBasicInfo: jest.fn(),
      updateInspectionConfig: jest.fn(),
      updateReportConfig: jest.fn(),
      updateUserPreference: jest.fn(),
      saveAll: saveAllMock.mockResolvedValue(undefined),
      resetAll: resetAllMock,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('应展示轻摘要并通过基础信息区块承载整页操作按钮', async () => {
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
      <SettingsShellProvider activeTabKey="general">
        <GeneralSettings />
        <ShellToolbar />
      </SettingsShellProvider>
    )

    expect(screen.queryByText('导出配置')).not.toBeInTheDocument()
    expect(screen.queryByText('导入配置')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '通用配置' })).toBeInTheDocument()
    expect(screen.getByText('当前应用名称')).toBeInTheDocument()
    expect(screen.getByText('当前时区')).toBeInTheDocument()
    expect(screen.getByText('默认并发任务数')).toBeInTheDocument()
    expect(screen.getByText('默认超时时间')).toBeInTheDocument()
    expect(screen.getByText('默认导出格式')).toBeInTheDocument()
    expect(screen.getByText('当前主题 / 语言')).toBeInTheDocument()

    expect(within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '保存整页更改' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('shell-toolbar')).queryByRole('button', { name: '重置整页更改' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: '保存整页更改' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置整页更改' })).toBeInTheDocument()

    expect(screen.queryByText('• 有未保存的更改')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('shell-caps')).toHaveTextContent('dirty:true')
    })
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('saving:false')
    expect(screen.getByTestId('shell-caps')).toHaveTextContent('blockLeave:true')

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(saveAllMock).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(resetAllMock).toHaveBeenCalled()
  })
})
