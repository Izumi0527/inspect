import { redirect } from 'next/navigation'

export default function SettingsPage() {
  // 重定向到通用配置页面
  redirect('/settings/general')
}
