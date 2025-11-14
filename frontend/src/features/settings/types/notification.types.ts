// 邮件通知配置
export interface EmailNotificationConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpUseTls: boolean
  senderEmail: string
  senderName: string
  testEmail?: string
}

// SMS通知配置
export interface SmsNotificationConfig {
  enabled: boolean
  provider: 'aliyun' | 'tencent' | 'twilio' | 'custom'
  apiKey: string
  apiSecret: string
  signName: string
  templateCode: string
  testPhone?: string
}

// Webhook通知配置
export interface WebhookNotificationConfig {
  enabled: boolean
  url: string
  method: 'POST' | 'PUT'
  headers: Record<string, string>
  authType: 'none' | 'bearer' | 'basic' | 'apikey'
  authToken?: string
  retryCount: number
  timeout: number
}

// 完整的通知设置响应
export interface NotificationSettingsResponse {
  emailNotification: EmailNotificationConfig
  smsNotification: SmsNotificationConfig
  webhookNotification: WebhookNotificationConfig
}

// 更新请求类型
export interface UpdateEmailNotificationRequest {
  enabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  smtpUseTls?: boolean
  senderEmail?: string
  senderName?: string
}

export interface UpdateSmsNotificationRequest {
  enabled?: boolean
  provider?: 'aliyun' | 'tencent' | 'twilio' | 'custom'
  apiKey?: string
  apiSecret?: string
  signName?: string
  templateCode?: string
}

export interface UpdateWebhookNotificationRequest {
  enabled?: boolean
  url?: string
  method?: 'POST' | 'PUT'
  headers?: Record<string, string>
  authType?: 'none' | 'bearer' | 'basic' | 'apikey'
  authToken?: string
  retryCount?: number
  timeout?: number
}

// 测试结果类型
export interface TestResult {
  success: boolean
  message: string
  details?: any
}
