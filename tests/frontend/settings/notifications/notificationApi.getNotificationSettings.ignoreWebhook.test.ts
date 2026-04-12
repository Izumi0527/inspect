const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { notificationApi } from '@/features/settings/api/notification.api'

describe('notificationApi.getNotificationSettings 忽略残留 webhook 设置', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('后端仍返回 notification.webhook.* 时，前端结果中不应暴露 webhook 结构', async () => {
    mockGet.mockResolvedValue({
      items: [
        { key: 'notification.email.enabled', value: true, category: 'notification' },
        { key: 'notification.sms.enabled', value: false, category: 'notification' },
        { key: 'notification.webhook.enabled', value: true, category: 'notification' },
        { key: 'notification.webhook.url', value: 'https://example.com/webhook', category: 'notification' },
      ],
      total: 4,
    })

    const result = await notificationApi.getNotificationSettings()

    expect(result).toEqual({
      emailNotification: expect.objectContaining({ enabled: true }),
      smsNotification: expect.objectContaining({ enabled: false }),
    })
    expect(result).not.toHaveProperty('webhookNotification')
  })
})
