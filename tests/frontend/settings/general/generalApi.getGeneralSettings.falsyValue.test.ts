const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { generalApi } from '@/features/settings/api/general.api'

describe('generalApi.getGeneralSettings falsy 值解析', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('后端返回 0/空字符串时不应被默认值覆盖（并应归一化枚举）', async () => {
    mockGet.mockResolvedValue({
      items: [
        { key: 'system.application_name', value: '', category: 'system' },
        { key: 'system.version', value: '', category: 'system' },
        { key: 'system.timezone', value: '', category: 'system' },
        { key: 'inspection.max_concurrent_tasks', value: 0, category: 'inspection' },
        { key: 'inspection.default_timeout', value: 0, category: 'inspection' },
        { key: 'inspection.retry_attempts', value: 0, category: 'inspection' },
        { key: 'report.default_format', value: 'PDF', category: 'report' },
        { key: 'report.max_export_records', value: 0, category: 'report' },
        { key: 'user_preference.theme', value: 'DARK', category: 'user_preference' },
        { key: 'user_preference.time_format', value: '12H', category: 'user_preference' },
      ],
      total: 10,
    })

    const result = await generalApi.getGeneralSettings()

    expect(result.basicInfo.applicationName).toBe('')
    expect(result.basicInfo.version).toBe('')
    expect(result.basicInfo.timezone).toBe('')

    expect(result.inspectionConfig.maxConcurrentTasks).toBe(0)
    expect(result.inspectionConfig.defaultTimeout).toBe(0)
    expect(result.inspectionConfig.retryAttempts).toBe(0)

    expect(result.reportConfig.defaultFormat).toBe('pdf')
    expect(result.reportConfig.maxExportRecords).toBe(0)

    expect(result.userPreference.theme).toBe('dark')
    expect(result.userPreference.timeFormat).toBe('12h')
  })

  it('system.version 无行时回退到全站统一版本号（非硬编码 1.0.1）', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 })

    const result = await generalApi.getGeneralSettings()

    expect(result.basicInfo.version).not.toBe('1.0.1')
    expect(result.basicInfo.version).toBe(process.env.NEXT_PUBLIC_APP_VERSION || '未知')
  })
})
