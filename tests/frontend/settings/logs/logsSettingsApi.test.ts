const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

import { logsSettingsApi } from '@/features/settings/api/logs.api'

describe('logsSettingsApi', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('getLogsSettings 应将后端配置映射为结构化数据', async () => {
    mockGet.mockResolvedValue([
      { key: 'logs.retention_days', value: 30, category: 'logs' },
      { key: 'logs.auto_cleanup_enabled', value: false, category: 'logs' },
    ])

    const result = await logsSettingsApi.getLogsSettings()

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/settings/general/settings?category=logs')
    expect(result.retentionDays).toBe(30)
    expect(result.autoCleanupEnabled).toBe(false)
  })

  it('getLogsSettings 在缺失配置时应使用默认值', async () => {
    mockGet.mockResolvedValue([])

    const result = await logsSettingsApi.getLogsSettings()

    expect(result.retentionDays).toBe(90)
    expect(result.autoCleanupEnabled).toBe(true)
  })

  it('saveLogsSettings 应通过 bulk 接口写入日志设置', async () => {
    mockPost.mockResolvedValue({ updated_count: 2 })

    await logsSettingsApi.saveLogsSettings({ retentionDays: 7, autoCleanupEnabled: true })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/settings/general/bulk', {
      settings: {
        'logs.retention_days': 7,
        'logs.auto_cleanup_enabled': true,
      },
    })
  })

  it('cleanupDeviceLogs 应调用后端清理接口', async () => {
    mockPost.mockResolvedValue({ deleted_count: 123 })

    const result = await logsSettingsApi.cleanupDeviceLogs({ retentionDays: 7 })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/logs/cleanup', { retention_days: 7 })
    expect(result.deletedCount).toBe(123)
  })
})

