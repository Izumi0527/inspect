import {
  Activity,
  Bell,
  Database,
  FileText,
  KeyRound,
  ScrollText,
  Settings,
  Shield,
  Users,
} from 'lucide-react'
import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'
import { LogsSettings } from '@/features/settings/components/logs/LogsSettings'
import { UserManagement } from '@/features/settings/components/users/UserManagement'
import { RoleManagement } from '@/features/settings/components/roles/RoleManagement'
import { SecuritySettings } from '@/features/settings/components/security/SecuritySettings'
import { AuditLogs } from '@/features/settings/components/audit/AuditLogs'
import { BackupManagement } from '@/features/settings/components/backup/BackupManagement'
import { NotificationSettings } from '@/features/settings/components/notifications/NotificationSettings'
import { MonitoringDashboard } from '@/features/settings/components/monitoring/MonitoringDashboard'
import { Permission } from '@/lib/types/auth.types'
import type { SettingsTabDescriptor, SettingsTabKey } from '@/features/settings/types/shell.types'

export const settingsTabRegistry: SettingsTabDescriptor[] = [
  {
    key: 'general',
    label: '通用配置',
    icon: Settings,
    description: '系统基础配置与核心参数管理',
    requiredPermissions: [Permission.SYSTEM_CONFIG],
    kind: 'form',
    scrollMode: 'page',
    toolbarMode: 'local',
    supportsStats: false,
    supportsLeaveGuard: true,
    component: GeneralSettings,
  },
  {
    key: 'logs',
    label: '日志设置',
    icon: ScrollText,
    description: '日志中心的数据保留与采集策略配置',
    requiredPermissions: [Permission.SYSTEM_CONFIG],
    kind: 'ops',
    scrollMode: 'page',
    toolbarMode: 'local',
    supportsStats: false,
    supportsLeaveGuard: true,
    component: LogsSettings,
  },
  {
    key: 'users',
    label: '用户管理',
    icon: Users,
    description: '系统用户账号与权限管理',
    requiredPermissions: [Permission.USERS_READ],
    kind: 'table',
    scrollMode: 'panel',
    toolbarMode: 'mixed',
    supportsStats: true,
    supportsLeaveGuard: false,
    component: UserManagement,
  },
  {
    key: 'roles',
    label: '角色权限',
    icon: KeyRound,
    description: '角色管理与权限分配（RBAC）',
    requiredPermissions: [Permission.USERS_READ],
    kind: 'table',
    scrollMode: 'panel',
    toolbarMode: 'mixed',
    supportsStats: true,
    supportsLeaveGuard: false,
    component: RoleManagement,
  },
  {
    key: 'security',
    label: '安全策略',
    icon: Shield,
    description: '密码策略、登录防护与访问控制',
    requiredPermissions: [Permission.SYSTEM_CONFIG],
    kind: 'form',
    scrollMode: 'page',
    toolbarMode: 'local',
    supportsStats: false,
    supportsLeaveGuard: true,
    component: SecuritySettings,
  },
  {
    key: 'audit',
    label: '审计日志',
    icon: FileText,
    description: '系统操作记录与安全审计',
    requiredPermissions: [Permission.SYSTEM_LOGS],
    kind: 'query',
    scrollMode: 'panel',
    toolbarMode: 'mixed',
    supportsStats: true,
    supportsLeaveGuard: false,
    component: AuditLogs,
  },
  {
    key: 'backup',
    label: '备份管理',
    icon: Database,
    description: '数据备份、恢复与存档管理',
    requiredPermissions: [Permission.SYSTEM_CONFIG],
    kind: 'ops',
    scrollMode: 'page',
    toolbarMode: 'local',
    supportsStats: true,
    supportsLeaveGuard: false,
    component: BackupManagement,
  },
  {
    key: 'notifications',
    label: '通知中心',
    icon: Bell,
    description: '告警通知渠道配置与管理',
    requiredPermissions: [Permission.SYSTEM_CONFIG],
    kind: 'form',
    scrollMode: 'page',
    toolbarMode: 'local',
    supportsStats: false,
    supportsLeaveGuard: true,
    component: NotificationSettings,
  },
  {
    key: 'monitoring',
    label: '系统监控',
    icon: Activity,
    description: '系统性能监控与健康状态',
    requiredPermissions: [Permission.MONITORING_READ],
    kind: 'dashboard',
    scrollMode: 'page',
    toolbarMode: 'mixed',
    supportsStats: true,
    supportsLeaveGuard: false,
    component: MonitoringDashboard,
  },
]

export const allSettingsTabKeys: SettingsTabKey[] = settingsTabRegistry.map(
  (tab) => tab.key
)

export const getSettingsTabDescriptor = (
  key: SettingsTabKey
): SettingsTabDescriptor | undefined =>
  settingsTabRegistry.find((tab) => tab.key === key)
