const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { notificationApi } from '@/features/settings/api/notification.api'

describe('notificationApi.getNotificationSettings 布尔回退', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('smtpUseTls 后端返回 false 时不应被 || true 覆盖', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          key: 'notification.email.smtp_use_tls',
          value: false,
          category: 'notification',
        },
      ],
      total: 1,
    })

    const result = await notificationApi.getNotificationSettings()

    expect(result.emailNotification.smtpUseTls).toBe(false)
  })
})

