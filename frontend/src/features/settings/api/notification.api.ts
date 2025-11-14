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
   * ✅ 使用新的统一 API 端点
   */
  getNotificationSettings: async (): Promise<NotificationSettingsResponse> => {
    // 获取所有配置（使用新的统一端点）
    const response = await httpClient.get<{ items: BackendSetting[]; total: number }>('/settings/notifications')
    const allSettings = response.items

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
   * ✅ 修复: 只发送 value 字段
   */
  updateEmailNotification: async (data: Partial<EmailNotificationConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.enabled !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.enabled', {
          value: data.enabled,  // ✅ 只发送 value
        })
      )
    }

    if (data.smtpHost !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.smtp_host', {
          value: data.smtpHost,  // ✅ 只发送 value
        })
      )
    }

    if (data.smtpPort !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.smtp_port', {
          value: data.smtpPort,  // ✅ 只发送 value
        })
      )
    }

    if (data.smtpUser !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.smtp_user', {
          value: data.smtpUser,  // ✅ 只发送 value
        })
      )
    }

    if (data.smtpPassword !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.smtp_password', {
          value: data.smtpPassword,  // ✅ 只发送 value
        })
      )
    }

    if (data.smtpUseTls !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.smtp_use_tls', {
          value: data.smtpUseTls,  // ✅ 只发送 value
        })
      )
    }

    if (data.senderEmail !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.sender_email', {
          value: data.senderEmail,  // ✅ 只发送 value
        })
      )
    }

    if (data.senderName !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.email.sender_name', {
          value: data.senderName,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新SMS通知配置
   * ✅ 修复: 只发送 value 字段
   */
  updateSmsNotification: async (data: Partial<SmsNotificationConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.enabled !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.enabled', {
          value: data.enabled,  // ✅ 只发送 value
        })
      )
    }

    if (data.provider !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.provider', {
          value: data.provider,  // ✅ 只发送 value
        })
      )
    }

    if (data.apiKey !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.api_key', {
          value: data.apiKey,  // ✅ 只发送 value
        })
      )
    }

    if (data.apiSecret !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.api_secret', {
          value: data.apiSecret,  // ✅ 只发送 value
        })
      )
    }

    if (data.signName !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.sign_name', {
          value: data.signName,  // ✅ 只发送 value
        })
      )
    }

    if (data.templateCode !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.sms.template_code', {
          value: data.templateCode,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新Webhook通知配置
   * ✅ 修复: 只发送 value 字段
   */
  updateWebhookNotification: async (
    data: Partial<WebhookNotificationConfig>
  ): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.enabled !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.enabled', {
          value: data.enabled,  // ✅ 只发送 value
        })
      )
    }

    if (data.url !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.url', {
          value: data.url,  // ✅ 只发送 value
        })
      )
    }

    if (data.method !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.method', {
          value: data.method,  // ✅ 只发送 value
        })
      )
    }

    if (data.headers !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.headers', {
          value: data.headers,  // ✅ 只发送 value
        })
      )
    }

    if (data.authType !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.auth_type', {
          value: data.authType,  // ✅ 只发送 value
        })
      )
    }

    if (data.authToken !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.auth_token', {
          value: data.authToken,  // ✅ 只发送 value
        })
      )
    }

    if (data.retryCount !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.retry_count', {
          value: data.retryCount,  // ✅ 只发送 value
        })
      )
    }

    if (data.timeout !== undefined) {
      updates.push(
        httpClient.put('/settings/notifications/notification.webhook.timeout', {
          value: data.timeout,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 批量保存所有通知配置
   */
  saveAll: async (data: NotificationSettingsResponse): Promise<void> => {
    const settings: Record<string, any> = {
      // 邮件通知配置
      'notification.email.enabled': data.emailNotification.enabled,
      'notification.email.smtp_host': data.emailNotification.smtpHost,
      'notification.email.smtp_port': data.emailNotification.smtpPort,
      'notification.email.smtp_user': data.emailNotification.smtpUser,
      'notification.email.smtp_password': data.emailNotification.smtpPassword,
      'notification.email.smtp_use_tls': data.emailNotification.smtpUseTls,
      'notification.email.sender_email': data.emailNotification.senderEmail,
      'notification.email.sender_name': data.emailNotification.senderName,
      // SMS通知配置
      'notification.sms.enabled': data.smsNotification.enabled,
      'notification.sms.provider': data.smsNotification.provider,
      'notification.sms.api_key': data.smsNotification.apiKey,
      'notification.sms.api_secret': data.smsNotification.apiSecret,
      'notification.sms.sign_name': data.smsNotification.signName,
      'notification.sms.template_code': data.smsNotification.templateCode,
      // Webhook通知配置
      'notification.webhook.enabled': data.webhookNotification.enabled,
      'notification.webhook.url': data.webhookNotification.url,
      'notification.webhook.method': data.webhookNotification.method,
      'notification.webhook.headers': data.webhookNotification.headers,
      'notification.webhook.auth_type': data.webhookNotification.authType,
      'notification.webhook.auth_token': data.webhookNotification.authToken,
      'notification.webhook.retry_count': data.webhookNotification.retryCount,
      'notification.webhook.timeout': data.webhookNotification.timeout,
    }

    await httpClient.post('/settings/notifications/bulk', { settings })
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
  testWebhookNotification: async (): Promise<TestResult> => {
    return await httpClient.post<TestResult>('/settings/notifications/test-webhook', {})
  },
}
