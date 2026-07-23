import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'

const mockUseGeneralSettings = jest.fn()
const mockUseSettingsTabCapabilities = jest.fn()
const mockSaveAll = jest.fn()
const mockResetAll = jest.fn()

jest.mock('@/features/settings/hooks/useGeneralSettings', () => ({
  useGeneralSettings: (...args: unknown[]) => mockUseGeneralSettings(...args),
}))

jest.mock('@/features/settings/hooks/useSettingsTabCapabilities', () => ({
  useSettingsTabCapabilities: (...args: unknown[]) =>
    mockUseSettingsTabCapabilities(...args),
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
      <div>基础信息区块</div>
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

jest.mock('@/features/settings/components/general/GeneralOverviewCard', () => ({
  GeneralOverviewCard: () => <div>通用配置概览区</div>,
}))

jest.mock('@/features/settings/components/general/InspectionConfigSection', () => ({
  InspectionConfigSection: () => <div>巡检配置区块</div>,
}))

jest.mock('@/features/settings/components/general/ReportConfigSection', () => ({
  ReportConfigSection: () => <div>报表配置区块</div>,
}))

jest.mock('@/features/settings/components/general/UserPreferenceSection', () => ({
  UserPreferenceSection: () => <div>用户偏好区块</div>,
}))

describe('GeneralSettings', () => {
  beforeEach(() => {
    mockSaveAll.mockReset()
    mockResetAll.mockReset()
    mockSaveAll.mockResolvedValue(undefined)

    mockUseGeneralSettings.mockReturnValue({
      basicInfo: {
        applicationName: '网络设备巡检系统',
        version: '1.0.1',
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
      saveAll: mockSaveAll,
      resetAll: mockResetAll,
    })
  })

  it('不再向壳层注册保存和重置动作，并展示页面级概览与整页保存按钮', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GeneralSettings />
      </QueryClientProvider>
    )

    const capabilities = mockUseSettingsTabCapabilities.mock.calls[0][1]
    expect(capabilities.dirty).toBe(true)
    expect(capabilities.saving).toBe(false)
    expect(capabilities.blockLeave).toBe(true)
    expect(capabilities.primaryActions).toBeUndefined()
    expect(capabilities.secondaryActions).toBeUndefined()

    expect(screen.getByText('通用配置概览区')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(mockSaveAll).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(mockResetAll).toHaveBeenCalledTimes(1)
  })
})
