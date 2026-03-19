import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Permission } from '@/lib/types/auth.types'

export type SettingsTabKey =
  | 'general'
  | 'logs'
  | 'users'
  | 'roles'
  | 'security'
  | 'audit'
  | 'backup'
  | 'notifications'
  | 'monitoring'

export type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

export type SettingsPageKind =
  | 'form'
  | 'ops'
  | 'table'
  | 'query'
  | 'dashboard'

export type SettingsScrollMode = 'page' | 'panel'
export type SettingsToolbarMode = 'shell' | 'local' | 'mixed'

export interface SettingsTabComponentProps {}

export interface SettingsPageAction {
  key: string
  label: string
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost'
  icon?: React.ReactNode
  disabled?: boolean
  loading?: boolean
  danger?: boolean
  onClick: () => void
}

export interface SettingsStatCardDescriptor {
  key: string
  title: string
  value: React.ReactNode
  icon: LucideIcon
  iconClassName?: string
  valueClassName?: string
}

export interface SettingsBannerDescriptor {
  key: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  description: string
  action?: SettingsPageAction
}

export interface SettingsToolbarDescriptor {
  search?: {
    value: string
    placeholder?: string
    ariaLabel: string
    onChange: (value: string) => void
    onSubmit?: () => void
  }
  filters?: React.ReactNode
  primaryActions?: SettingsPageAction[]
  secondaryActions?: SettingsPageAction[]
}

export interface SettingsTabCapabilities {
  loading?: boolean
  dirty?: boolean
  saving?: boolean
  blockLeave?: boolean
  stats?: SettingsStatCardDescriptor[]
  toolbar?: SettingsToolbarDescriptor
  banners?: SettingsBannerDescriptor[]
  primaryActions?: SettingsPageAction[]
  secondaryActions?: SettingsPageAction[]
}

export interface SettingsTabDescriptor {
  key: SettingsTabKey
  label: string
  icon: IconComponent
  description: string
  requiredPermissions: Permission[]
  kind: SettingsPageKind
  scrollMode: SettingsScrollMode
  toolbarMode: SettingsToolbarMode
  supportsStats: boolean
  supportsLeaveGuard: boolean
  component: React.ComponentType<SettingsTabComponentProps>
}
