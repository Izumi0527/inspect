import { NotificationSettings } from '@/features/settings/components/notifications/NotificationSettings'

export const metadata = {
  title: '通知中心 | 系统管理',
  description: '管理邮件通知、短信通知和Webhook通知配置',
}

export default function NotificationsPage() {
  return <NotificationSettings />
}
