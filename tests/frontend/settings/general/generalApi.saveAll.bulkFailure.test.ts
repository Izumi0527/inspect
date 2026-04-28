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
        basicInfo: { applicationName: 'x', version: '1.0.1', timezone: 'Asia/Shanghai' },
        inspectionConfig: { maxConcurrentTasks: 10, defaultTimeout: 30, retryAttempts: 3 },
        reportConfig: { defaultFormat: 'excel', maxExportRecords: 10000 },
        userPreference: { theme: 'auto', language: 'zh-CN', dateFormat: 'YYYY-MM-DD', timeFormat: '24h' },
      })
    ).rejects.toThrow('失败')
  })
})
