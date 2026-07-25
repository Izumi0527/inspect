const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

import { generalApi } from '@/features/settings/api/general.api'

describe('generalApi.saveAll bulk failed_keys 处理', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it('failed_keys 非空时应抛错，避免前端提示“保存成功”但实际部分失败', async () => {
    mockPost.mockResolvedValue({
      updated_count: 1,
      failed_keys: ['user_preference.theme'],
      message: '成功更新 1 个配置项，失败 1 个',
    })

    await expect(
      generalApi.saveAll({
        basicInfo: { applicationName: 'x', version: '1.1.0', timezone: 'Asia/Shanghai' },
        inspectionConfig: { maxConcurrentTasks: 10, defaultTimeout: 30, retryAttempts: 3 },
        reportConfig: { defaultFormat: 'excel', maxExportRecords: 10000 },
        userPreference: { theme: 'auto', timeFormat: '24h' },
      })
    ).rejects.toThrow('失败')
  })

  it('提交的 settings 不再包含已下线的 language/date_format key', async () => {
    mockPost.mockResolvedValue({ updated_count: 9, failed_keys: [], message: 'ok' })

    await generalApi.saveAll({
      basicInfo: { applicationName: 'x', version: '1.1.0', timezone: 'Asia/Shanghai' },
      inspectionConfig: { maxConcurrentTasks: 10, defaultTimeout: 30, retryAttempts: 3 },
      reportConfig: { defaultFormat: 'excel', maxExportRecords: 10000 },
      userPreference: { theme: 'auto', timeFormat: '24h' },
    })

    const payload = mockPost.mock.calls[0][1] as { settings: Record<string, unknown> }
    expect(Object.keys(payload.settings)).not.toContain('user_preference.language')
    expect(Object.keys(payload.settings)).not.toContain('user_preference.date_format')
    expect(Object.keys(payload.settings)).toHaveLength(9)
  })
})
