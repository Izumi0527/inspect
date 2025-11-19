'use client'

import { Info, Settings, Bell, Shield, Database, Search, FileText, User } from 'lucide-react'
import { type LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  description?: string
  icon?: string | LucideIcon
}

const iconMap: Record<string, LucideIcon> = {
  Info,
  Settings,
  Bell,
  Shield,
  Database,
  Search,
  FileText,
  User,
}

export function SectionHeader({ title, description, icon }: SectionHeaderProps) {
  let IconComponent: LucideIcon | null = null

  if (icon) {
    if (typeof icon === 'string') {
      IconComponent = iconMap[icon] || null
    } else {
      IconComponent = icon
    }
  }

  return (
    <div className="flex items-start space-x-3">
      {IconComponent && (
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
    </div>
  )
}
