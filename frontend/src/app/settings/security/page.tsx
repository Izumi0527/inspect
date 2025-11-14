import { SecuritySettings } from '@/features/settings/components/security/SecuritySettings'

export const metadata = {
  title: '安全策略 | 系统管理',
  description: '管理会话控制、密码策略和认证方式配置',
}

export default function SecurityPage() {
  return <SecuritySettings />
}
