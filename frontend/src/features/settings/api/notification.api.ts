import { httpClient } from '@/lib/api-client'
import type {
  EmailNotificationConfig,
  SmsNotificationConfig,
  NotificationSettingsResponse,
  TestResult,
} from '../types/notification.types'
import { requireBulkSuccess, type BulkUpdateResponse } from './bulk'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: unknown
  category: string
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
  }
  return fallback
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

function toEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  const match = allowed.find((item) => item.toLowerCase() === normalized)
  return match ?? fallback
}

function pruneWebhookSettings(settings: BackendSetting[]): BackendSetting[] {
  return settings.filter((setting) => !setting.key.startsWith('notification.webhook.'))
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
    const allSettings = pruneWebhookSettings(response.items || [])

    // 创建一个 key-value 映射
    const settingsMap = new Map<string, unknown>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 邮件配置（与后端发送侧 loadSMTPConfig 保持一致：优先新键，缺失时回退 legacy 键）
    const smtpHostPrimary = toString(settingsMap.get('notification.email.smtp_host'), '')
    const smtpHostLegacy = toString(settingsMap.get('email.smtp_server'), '')
    const smtpHost = smtpHostPrimary.trim() ? smtpHostPrimary : smtpHostLegacy

    const smtpPortPrimary = toNumber(settingsMap.get('notification.email.smtp_port'), 587)
    let smtpPort = smtpPortPrimary
    if (smtpPortPrimary === 587) {
      const legacyPort = toNumber(settingsMap.get('email.smtp_port'), 0)
      if (legacyPort > 0) smtpPort = legacyPort
    }

    const smtpUserPrimary = toString(settingsMap.get('notification.email.smtp_user'), '')
    const smtpUserLegacy = toString(settingsMap.get('email.smtp_username'), '')
    const smtpUser = smtpUserPrimary.trim() ? smtpUserPrimary : smtpUserLegacy

    const smtpPasswordPrimary = toString(settingsMap.get('notification.email.smtp_password'), '')
    const smtpPasswordLegacy = toString(settingsMap.get('email.smtp_password'), '')
    const smtpPassword = smtpPasswordPrimary.trim() ? smtpPasswordPrimary : smtpPasswordLegacy

    const senderEmailPrimary = toString(settingsMap.get('notification.email.sender_email'), '')
    const senderEmailLegacy = toString(settingsMap.get('email.sender_email'), '')
    const senderEmail = (senderEmailPrimary.trim() ? senderEmailPrimary : senderEmailLegacy).trim() || smtpUser

    const senderNamePrimary = toString(settingsMap.get('notification.email.sender_name'), '')
    const senderNameLegacy = toString(settingsMap.get('email.sender_name'), '')
    const senderName = senderNamePrimary.trim() ? senderNamePrimary : senderNameLegacy

    // 转换为结构化数据
    return {
      emailNotification: {
        enabled: toBoolean(settingsMap.get('notification.email.enabled'), false),
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        smtpUseTls: toBoolean(settingsMap.get('notification.email.smtp_use_tls'), true),
        senderEmail,
        senderName,
      },
      smsNotification: {
        enabled: toBoolean(settingsMap.get('notification.sms.enabled'), false),
        provider: toEnum(
          settingsMap.get('notification.sms.provider'),
          ['aliyun', 'tencent', 'twilio', 'custom'] as const,
          'aliyun'
        ),
        apiKey: toString(settingsMap.get('notification.sms.api_key'), ''),
        apiSecret: toString(settingsMap.get('notification.sms.api_secret'), ''),
        signName: toString(settingsMap.get('notification.sms.sign_name'), ''),
        templateCode: toString(settingsMap.get('notification.sms.template_code'), ''),
      },
    }
  },

  /**
   * 更新邮件通知配置
   * ✅ 单独更新同样走 bulk（与 saveAll 语义一致，避免 stub/假成功）
   */
  updateEmailNotification: async (data: Partial<EmailNotificationConfig>): Promise<void> => {
    const settings: Record<string, unknown> = {}

    if (data.enabled !== undefined) settings['notification.email.enabled'] = data.enabled
    if (data.smtpHost !== undefined) settings['notification.email.smtp_host'] = data.smtpHost
    if (data.smtpPort !== undefined) settings['notification.email.smtp_port'] = data.smtpPort
    if (data.smtpUser !== undefined) settings['notification.email.smtp_user'] = data.smtpUser
    if (data.smtpPassword !== undefined) settings['notification.email.smtp_password'] = data.smtpPassword
    if (data.smtpUseTls !== undefined) settings['notification.email.smtp_use_tls'] = data.smtpUseTls
    if (data.senderEmail !== undefined) settings['notification.email.sender_email'] = data.senderEmail
    if (data.senderName !== undefined) settings['notification.email.sender_name'] = data.senderName

    if (Object.keys(settings).length === 0) return

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存邮件通知配置' })
  },

  /**
   * 更新SMS通知配置
   * ✅ 单独更新同样走 bulk（与 saveAll 语义一致，避免 stub/假成功）
   */
  updateSmsNotification: async (data: Partial<SmsNotificationConfig>): Promise<void> => {
    const settings: Record<string, unknown> = {}

    if (data.enabled !== undefined) settings['notification.sms.enabled'] = data.enabled
    if (data.provider !== undefined) settings['notification.sms.provider'] = data.provider
    if (data.apiKey !== undefined) settings['notification.sms.api_key'] = data.apiKey
    if (data.apiSecret !== undefined) settings['notification.sms.api_secret'] = data.apiSecret
    if (data.signName !== undefined) settings['notification.sms.sign_name'] = data.signName
    if (data.templateCode !== undefined) settings['notification.sms.template_code'] = data.templateCode

    if (Object.keys(settings).length === 0) return

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存短信通知配置' })
  },

  /**
   * 批量保存所有通知配置
   * ✅ 使用统一批量配置端点: POST /settings/general/bulk
   */
  saveAll: async (data: NotificationSettingsResponse): Promise<void> => {
    const settings: Record<string, unknown> = {
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
    }

    const resp = await httpClient.post<BulkUpdateResponse>('/settings/general/bulk', { settings })
    requireBulkSuccess(resp, { action: '保存通知中心配置' })
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

}
