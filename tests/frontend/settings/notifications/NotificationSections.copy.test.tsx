import { render, screen } from '@testing-library/react'

import { EmailNotificationSection } from '@/features/settings/components/notifications/EmailNotificationSection'
import { NotificationOverviewCard } from '@/features/settings/components/notifications/NotificationOverviewCard'
import { SmsNotificationSection } from '@/features/settings/components/notifications/SmsNotificationSection'
import type {
  EmailNotificationConfig,
  SmsNotificationConfig,
} from '@/features/settings/types/notification.types'

const emailNotification: EmailNotificationConfig = {
  enabled: true,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpUser: 'user@example.com',
  smtpPassword: 'secret',
  smtpUseTls: true,
  senderEmail: 'noreply@example.com',
  senderName: '网络设备巡检系统',
}

const smsNotification: SmsNotificationConfig = {
  enabled: true,
  provider: 'aliyun',
  apiKey: 'LTAI...',
  apiSecret: 'secret',
  signName: '网络设备巡检系统',
  templateCode: 'SMS_123456789',
}

const removedExplanatoryCopies = [
  '当前页面用于配置系统事件通知渠道',
  '建议保存整页后再执行测试发送',
  '配置 SMTP 服务器用于发送邮件通知，并作为当前页面整页配置的保存入口',
  '保存整页更改会同时提交当前页面中的邮件和短信配置',
  '启用传输层安全协议（推荐）',
  '测试发送用于验证通知链路',
  '配置短信服务商、凭据和模板，用于发送 SMS 通知',
  '测试短信用于验证短信服务商链路',
  '发送测试短信以验证配置是否正确',
]

const retainedFunctionalCopies = [
  '通知中心',
  '已启用渠道',
  '邮件通知',
  '短信通知',
  '2 / 2',
  '启用邮件通知',
  'SMTP 服务器地址',
  'SMTP 端口',
  '通常为 587（TLS）或 465（SSL）',
  '使用 TLS 加密',
  '启用传输层安全协议',
  'SMTP 用户名',
  'SMTP 密码',
  '发件人邮箱',
  '发件人名称',
  '测试邮件通知',
  '发送测试邮件',
  '启用短信通知',
  '短信服务提供商',
  'API Key / Access Key ID',
  'API Secret / Access Key Secret',
  '短信签名',
  '短信模板代码',
  '测试短信通知',
  '发送测试短信',
  '保存整页更改',
  '重置整页更改',
]

describe('NotificationSettings 通知中心页说明文案', () => {
  it('不展示页面导览、测试建议和保存语义说明文案', () => {
    render(
      <div>
        <NotificationOverviewCard emailEnabled={true} smsEnabled={true} />
        <EmailNotificationSection
          data={emailNotification}
          onChange={jest.fn()}
          isTesting={false}
          onTest={jest.fn()}
          actions={{
            isDirty: true,
            isSaving: false,
            onSave: jest.fn(),
            onReset: jest.fn(),
          }}
        />
        <SmsNotificationSection
          data={smsNotification}
          onChange={jest.fn()}
          isTesting={false}
          onTest={jest.fn()}
        />
      </div>
    )

    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    for (const copy of retainedFunctionalCopies) {
      expect(screen.getAllByText(copy, { exact: false }).length).toBeGreaterThan(0)
    }
  })
})
