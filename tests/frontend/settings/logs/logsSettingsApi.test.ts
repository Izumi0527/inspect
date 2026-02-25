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
      { key: 'logs.syslog.enabled', value: true, category: 'logs' },
      { key: 'logs.syslog.protocol', value: 'udp', category: 'logs' },
      { key: 'logs.syslog.host', value: '0.0.0.0', category: 'logs' },
      { key: 'logs.syslog.port', value: 5514, category: 'logs' },
      { key: 'logs.syslog.max_message_bytes', value: 4096, category: 'logs' },
      { key: 'logs.syslog.alerts.enabled', value: true, category: 'logs' },
      { key: 'logs.syslog.alerts.max_new_per_minute', value: 10, category: 'logs' },
    ])

    const result = await logsSettingsApi.getLogsSettings()

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/settings/general/settings?category=logs')
    expect(result.retentionDays).toBe(30)
    expect(result.autoCleanupEnabled).toBe(false)
    expect(result.syslog.enabled).toBe(true)
    expect(result.syslog.protocol).toBe('udp')
    expect(result.syslog.host).toBe('0.0.0.0')
    expect(result.syslog.port).toBe(5514)
    expect(result.syslog.maxMessageBytes).toBe(4096)
    expect(result.syslog.alertsEnabled).toBe(true)
    expect(result.syslog.alertsMaxNewPerMinute).toBe(10)
  })

  it('getLogsSettings 在缺失配置时应使用默认值', async () => {
    mockGet.mockResolvedValue([])

    const result = await logsSettingsApi.getLogsSettings()

    expect(result.retentionDays).toBe(90)
    expect(result.autoCleanupEnabled).toBe(true)
    expect(result.syslog.enabled).toBe(false)
    expect(result.syslog.protocol).toBe('both')
    expect(result.syslog.host).toBe('0.0.0.0')
    expect(result.syslog.port).toBe(5514)
    expect(result.syslog.maxMessageBytes).toBe(8192)
    expect(result.syslog.alertsEnabled).toBe(true)
    expect(result.syslog.alertsMaxNewPerMinute).toBe(30)
  })

  it('saveLogsSettings 应通过 bulk 接口写入日志设置', async () => {
    mockPost.mockResolvedValue({ updated_count: 2 })

    await logsSettingsApi.saveLogsSettings({
      retentionDays: 7,
      autoCleanupEnabled: true,
      syslog: {
        enabled: true,
        protocol: 'both',
        host: '0.0.0.0',
        port: 5514,
        maxMessageBytes: 8192,
        alertsEnabled: true,
        alertsMaxNewPerMinute: 30,
      },
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/settings/general/bulk', {
      settings: {
        'logs.retention_days': 7,
        'logs.auto_cleanup_enabled': true,
        'logs.syslog.enabled': true,
        'logs.syslog.protocol': 'both',
        'logs.syslog.host': '0.0.0.0',
        'logs.syslog.port': 5514,
        'logs.syslog.max_message_bytes': 8192,
        'logs.syslog.alerts.enabled': true,
        'logs.syslog.alerts.max_new_per_minute': 30,
      },
    })
  })

  it('getSyslogStatus 应将后端状态映射为结构化数据', async () => {
    mockGet.mockResolvedValue({
      running: true,
      config: {
        enabled: true,
        protocol: 'both',
        host: '0.0.0.0',
        port: 5514,
        max_message_bytes: 8192,
        alerts_enabled: true,
        alerts_max_new_per_minute: 30,
      },
      received: 100,
      stored: 90,
      dropped_unmatched: 5,
      dropped_parse: 5,
      alerts_created: 1,
      alerts_updated: 2,
      alerts_rate_limited: 3,
      last_error: '',
      updated_at: '2026-02-25T10:00:00Z',
    })

    const result = await logsSettingsApi.getSyslogStatus()

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/logs/syslog/status')
    expect(result.running).toBe(true)
    expect(result.config.port).toBe(5514)
    expect(result.received).toBe(100)
    expect(result.alertsRateLimited).toBe(3)
  })

  it('applySyslogConfig 应调用后端 apply 接口并返回状态', async () => {
    mockPost.mockResolvedValue({
      running: true,
      config: {
        enabled: true,
        protocol: 'udp',
        host: '0.0.0.0',
        port: 5514,
        max_message_bytes: 4096,
        alerts_enabled: false,
        alerts_max_new_per_minute: 0,
      },
      received: 0,
      stored: 0,
      dropped_unmatched: 0,
      dropped_parse: 0,
      alerts_created: 0,
      alerts_updated: 0,
      alerts_rate_limited: 0,
      updated_at: '2026-02-25T10:00:00Z',
    })

    const result = await logsSettingsApi.applySyslogConfig()

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/logs/syslog/apply', {})
    expect(result.running).toBe(true)
    expect(result.config.protocol).toBe('udp')
    expect(result.config.maxMessageBytes).toBe(4096)
    expect(result.config.alertsEnabled).toBe(false)
  })

  it('cleanupDeviceLogs 应调用后端清理接口', async () => {
    mockPost.mockResolvedValue({ deleted_count: 123 })

    const result = await logsSettingsApi.cleanupDeviceLogs({ retentionDays: 7 })

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/logs/cleanup', { retention_days: 7 })
    expect(result.deletedCount).toBe(123)
  })
})
