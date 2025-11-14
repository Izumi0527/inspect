'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import {
  Settings,
  Users,
  Shield,
  FileText,
  Database,
  Bell,
  Activity,
} from 'lucide-react'

const tabs = [
  { name: '通用配置', href: '/settings/general', icon: Settings },
  { name: '用户管理', href: '/settings/users', icon: Users },
  { name: '安全策略', href: '/settings/security', icon: Shield },
  { name: '审计日志', href: '/settings/audit', icon: FileText },
  { name: '备份管理', href: '/settings/backup', icon: Database },
  { name: '通知中心', href: '/settings/notifications', icon: Bell },
  { name: '系统监控', href: '/settings/monitoring', icon: Activity },
]

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex space-x-8" aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              'group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm transition-colors',
              isActive
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <Icon
              className={cn(
                'mr-2 h-5 w-5',
                isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
              )}
            />
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}
