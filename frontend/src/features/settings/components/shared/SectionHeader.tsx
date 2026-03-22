'use client'

import { Info, Settings, Bell, Shield, Database, Search, FileText, User } from 'lucide-react'
import { type LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  description?: string
  icon?: string | LucideIcon
  actions?: React.ReactNode
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

export function SectionHeader({
  title,
  description,
  icon,
  actions,
}: SectionHeaderProps) {
  let IconComponent: LucideIcon | null = null

  if (icon) {
    if (typeof icon === 'string') {
      IconComponent = iconMap[icon] || null
    } else {
      IconComponent = icon
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start space-x-3 flex-1 min-w-0">
        {IconComponent && (
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {actions ? <div className="flex-shrink-0">{actions}</div> : null}
    </div>
  )
}
