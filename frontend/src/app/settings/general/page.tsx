import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'

export const metadata = {
  title: '通用配置 | 系统管理',
  description: '管理系统基础配置、巡检配置、报表配置和个人偏好',
}

export default function GeneralPage() {
  return <GeneralSettings />
}
