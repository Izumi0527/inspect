import React from 'react'
import { render, screen } from '@testing-library/react'

import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'

const mockUseGeneralSettings = jest.fn()

jest.mock('@/features/settings/hooks/useGeneralSettings', () => ({
  useGeneralSettings: () => mockUseGeneralSettings(),
}))

jest.mock('@/features/settings/components/general/BasicInfoSection', () => ({
  BasicInfoSection: () => <div>basic-info-section</div>,
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
      saveAll: jest.fn(),
      resetAll: jest.fn(),
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('不应显示导出/导入配置按钮，并保留保存/重置按钮', () => {
    render(<GeneralSettings />)

    expect(screen.queryByText('导出配置')).not.toBeInTheDocument()
    expect(screen.queryByText('导入配置')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
  })
})
