const mockGet = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { notificationApi } from '@/features/settings/api/notification.api'

describe('notificationApi.getNotificationSettings legacy email.* 回退', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('当 notification.email.* 缺失时，应回退读取 email.*（与后端发送侧一致）', async () => {
    mockGet.mockResolvedValue({
      items: [
        { key: 'notification.email.smtp_host', value: '', category: 'notification' },
        { key: 'email.smtp_server', value: 'smtp.legacy.example.com', category: 'email' },
        { key: 'email.smtp_port', value: '465', category: 'email' },
        { key: 'email.smtp_username', value: 'legacy_user', category: 'email' },
        { key: 'email.smtp_password', value: 'legacy_pwd', category: 'email' },
        { key: 'email.sender_email', value: 'sender@legacy.example.com', category: 'email' },
        { key: 'email.sender_name', value: 'Legacy Sender', category: 'email' },
      ],
      total: 7,
    })

    const result = await notificationApi.getNotificationSettings()

    expect(result.emailNotification.smtpHost).toBe('smtp.legacy.example.com')
    expect(result.emailNotification.smtpPort).toBe(465)
    expect(result.emailNotification.smtpUser).toBe('legacy_user')
    expect(result.emailNotification.smtpPassword).toBe('legacy_pwd')
    expect(result.emailNotification.senderEmail).toBe('sender@legacy.example.com')
    expect(result.emailNotification.senderName).toBe('Legacy Sender')
  })
})

