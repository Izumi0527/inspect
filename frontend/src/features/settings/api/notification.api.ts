import { httpClient } from '@/lib/api-client'
import type {
  EmailNotificationConfig,
  SmsNotificationConfig,
  WebhookNotificationConfig,
  NotificationSettingsResponse,
  TestResult,
} from '../types/notification.types'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: any
  category: string
}

export const notificationApi = {
  /**
   * 获取所有通知配置
   * 从后端获取配置后，转换为结构化数据
   * ✅ 使用新的统一 API 端点: GET /settings/notifications/
   */
  getNotificationSettings: async (): Promise<NotificationSettingsResponse> => {
    // 获取所有配置（使用新的统一端点）
    // 后端实际路由: GET /api/v1/settings/notifications/
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/notifications/')
    const allSettings = response.items || []

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, any>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
    return {
      emailNotification: {
        enabled: settingsMap.get('notification.email.enabled') || false,
        smtpHost: settingsMap.get('notification.email.smtp_host') || '',
        smtpPort: settingsMap.get('notification.email.smtp_port') || 587,
        smtpUser: settingsMap.get('notification.email.smtp_user') || '',
        smtpPassword: settingsMap.get('notification.email.smtp_password') || '',
        smtpUseTls: settingsMap.get('notification.email.smtp_use_tls') || true,
        senderEmail: settingsMap.get('notification.email.sender_email') || '',
        senderName: settingsMap.get('notification.email.sender_name') || '',
      },
      smsNotification: {
        enabled: settingsMap.get('notification.sms.enabled') || false,
        provider: settingsMap.get('notification.sms.provider') || 'aliyun',
        apiKey: settingsMap.get('notification.sms.api_key') || '',
        apiSecret: settingsMap.get('notification.sms.api_secret') || '',
        signName: settingsMap.get('notification.sms.sign_name') || '',
        templateCode: settingsMap.get('notification.sms.template_code') || '',
      },
      webhookNotification: {
        enabled: settingsMap.get('notification.webhook.enabled') || false,
        url: settingsMap.get('notification.webhook.url') || '',
        method: settingsMap.get('notification.webhook.method') || 'POST',
        headers: settingsMap.get('notification.webhook.headers') || {},
        authType: settingsMap.get('notification.webhook.auth_type') || 'none',
        authToken: settingsMap.get('notification.webhook.auth_token') || '',
        retryCount: settingsMap.get('notification.webhook.retry_count') || 3,
        timeout: settingsMap.get('notification.webhook.timeout') || 30,
      },
    }
  },

  /**
   * 更新邮件通知配置
   * 注意: 后端暂不支持单独更新通知配置项
   */
  updateEmailNotification: async (_data: Partial<EmailNotificationConfig>): Promise<void> => {
    console.warn('后端暂不支持单独更新通知配置项')
    return Promise.resolve()
  },

  /**
   * 更新SMS通知配置
   * 注意: 后端暂不支持单独更新通知配置项
   */
  updateSmsNotification: async (_data: Partial<SmsNotificationConfig>): Promise<void> => {
    console.warn('后端暂不支持单独更新通知配置项')
    return Promise.resolve()
  },

  /**
   * 更新Webhook通知配置
   * 注意: 后端暂不支持单独更新通知配置项
   */
  updateWebhookNotification: async (
    _data: Partial<WebhookNotificationConfig>
  ): Promise<void> => {
    console.warn('后端暂不支持单独更新通知配置项')
    return Promise.resolve()
  },

  /**
   * 批量保存所有通知配置
   * ✅ 使用统一批量配置端点: POST /settings/general/bulk
   */
  saveAll: async (data: NotificationSettingsResponse): Promise<void> => {
    const settings: Record<string, any> = {
      // Email
      'notification.email.enabled': data.emailNotification.enabled,
      'notification.email.smtp_host': data.emailNotification.smtpHost,
      'notification.email.smtp_port': data.emailNotification.smtpPort,
      'notification.email.smtp_user': data.emailNotification.smtpUser,
      'notification.email.smtp_password': data.emailNotification.smtpPassword,
      'notification.email.smtp_use_tls': data.emailNotification.smtpUseTls,
      'notification.email.sender_email': data.emailNotification.senderEmail,
      'notification.email.sender_name': data.emailNotification.senderName,

      // SMS（暂不做真实发送，但配置可落库）
      'notification.sms.enabled': data.smsNotification.enabled,
      'notification.sms.provider': data.smsNotification.provider,
      'notification.sms.api_key': data.smsNotification.apiKey,
      'notification.sms.api_secret': data.smsNotification.apiSecret,
      'notification.sms.sign_name': data.smsNotification.signName,
      'notification.sms.template_code': data.smsNotification.templateCode,

      // Webhook
      'notification.webhook.enabled': data.webhookNotification.enabled,
      'notification.webhook.url': data.webhookNotification.url,
      'notification.webhook.method': data.webhookNotification.method,
      'notification.webhook.headers': data.webhookNotification.headers,
      'notification.webhook.auth_type': data.webhookNotification.authType,
      'notification.webhook.auth_token': data.webhookNotification.authToken || '',
      'notification.webhook.retry_count': data.webhookNotification.retryCount,
      'notification.webhook.timeout': data.webhookNotification.timeout,
    }

    await httpClient.post('/settings/general/bulk', { settings })
  },

  /**
   * 测试邮件通知
   */
  testEmailNotification: async (email: string): Promise<TestResult> => {
    return await httpClient.post<TestResult>('/settings/notifications/test-email', { email })
  },

  /**
   * 测试SMS通知
   */
  testSmsNotification: async (phone: string): Promise<TestResult> => {
    return await httpClient.post<TestResult>('/settings/notifications/test-sms', { phone })
  },

  /**
   * 测试Webhook通知
   */
  testWebhookNotification: async (data: Partial<WebhookNotificationConfig> = {}): Promise<TestResult> => {
    const payload: Record<string, any> = {}
    if (data.url) payload.url = data.url
    if (data.method) payload.method = data.method
    if (data.headers) payload.headers = data.headers

    // 提供一个最小的测试事件载荷
    payload.payload = {
      event: 'test',
      message: '这是一个测试Webhook请求',
      timestamp: new Date().toISOString(),
    }

    return await httpClient.post<TestResult>('/settings/notifications/test-webhook', payload)
  },
}
