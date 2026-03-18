'use client'

import React, { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Settings,
  Users,
  Shield,
  FileText,
  Database,
  Bell,
  Activity,
  ScrollText,
  KeyRound
} from 'lucide-react'
import { AppLayout } from '@/components/layout'
import { GeneralSettings } from './general/GeneralSettings'
import { UserManagement } from './users/UserManagement'
import { RoleManagement } from './roles/RoleManagement'
import { SecuritySettings } from './security/SecuritySettings'
import { AuditLogs } from './audit/AuditLogs'
import { BackupManagement } from './backup/BackupManagement'
import { NotificationSettings } from './notifications/NotificationSettings'
import { MonitoringDashboard } from './monitoring/MonitoringDashboard'
import { LogsSettings } from './logs/LogsSettings'
import { EmptyState } from './shared/EmptyState'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'

type TabType =
  | 'general'
  | 'logs'
  | 'users'
  | 'roles'
  | 'security'
  | 'audit'
  | 'backup'
  | 'notifications'
  | 'monitoring'

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

interface TabConfig {
  key: TabType
  label: string
  icon: IconComponent
  description: string
}

export const SettingsView: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // 标签页可见性（按最小权限控制，避免用户进入后再看到 403）
  const canConfigSystem = usePermission(Permission.SYSTEM_CONFIG)
  const canReadUsers = usePermission(Permission.USERS_READ)
  const canReadAudit = usePermission(Permission.SYSTEM_LOGS)
  const canReadMonitoring = usePermission(Permission.MONITORING_READ)

  const tabParam = useMemo(() => {
    const value = searchParams?.get('tab')
    return value ? value.trim() : ''
  }, [searchParams])

  const tabs: TabConfig[] = useMemo(() => {
    const all: Array<TabConfig & { visible: boolean }> = [
      {
        key: 'general',
        label: '通用配置',
        icon: Settings,
        description: '系统基础配置与核心参数管理',
        visible: canConfigSystem,
      },
      {
        key: 'logs',
        label: '日志设置',
        icon: ScrollText,
        description: '日志中心的数据保留与采集策略配置',
        visible: canConfigSystem,
      },
      {
        key: 'users',
        label: '用户管理',
        icon: Users,
        description: '系统用户账号与权限管理',
        visible: canReadUsers,
      },
      {
        key: 'roles',
        label: '角色权限',
        icon: KeyRound,
        description: '角色管理与权限分配（RBAC）',
        visible: canReadUsers,
      },
      {
        key: 'security',
        label: '安全策略',
        icon: Shield,
        description: '密码策略、登录防护与访问控制',
        visible: canConfigSystem,
      },
      {
        key: 'audit',
        label: '审计日志',
        icon: FileText,
        description: '系统操作记录与安全审计',
        visible: canReadAudit,
      },
      {
        key: 'backup',
        label: '备份管理',
        icon: Database,
        description: '数据备份、恢复与存档管理',
        visible: canConfigSystem,
      },
      {
        key: 'notifications',
        label: '通知中心',
        icon: Bell,
        description: '告警通知渠道配置与管理',
        visible: canConfigSystem,
      },
      {
        key: 'monitoring',
        label: '系统监控',
        icon: Activity,
        description: '系统性能监控与健康状态',
        visible: canReadMonitoring,
      },
    ]

    return all.filter((t) => t.visible).map(({ visible: _visible, ...rest }) => rest)
  }, [canConfigSystem, canReadUsers, canReadAudit, canReadMonitoring])

  const allTabKeys: TabType[] = useMemo(
    () => [
      'general',
      'logs',
      'users',
      'roles',
      'security',
      'audit',
      'backup',
      'notifications',
      'monitoring',
    ],
    []
  )

  const requestedTab: TabType | null = useMemo(() => {
    if (!tabParam) return null
    return allTabKeys.includes(tabParam as TabType) ? (tabParam as TabType) : null
  }, [allTabKeys, tabParam])

  const activeTab: TabType | null = useMemo(() => {
    if (!tabs.length) return null
    const visible = new Set(tabs.map((t) => t.key))
    if (requestedTab && visible.has(requestedTab)) return requestedTab
    return tabs[0].key
  }, [requestedTab, tabs])

  // 修正 URL：避免用户手动输入不可见 tab 导致“短暂渲染 + 无意义请求”
  useEffect(() => {
    if (!activeTab) return
    if (requestedTab === activeTab) return

    const params = new URLSearchParams(searchParams?.toString())
    params.set('tab', activeTab)
    router.replace(`${pathname}?${params.toString()}`)
  }, [activeTab, pathname, requestedTab, router, searchParams])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'logs':
        return <LogsSettings />
      case 'users':
        return <UserManagement />
      case 'roles':
        return <RoleManagement />
      case 'security':
        return <SecuritySettings />
      case 'audit':
        return <AuditLogs />
      case 'backup':
        return <BackupManagement />
      case 'notifications':
        return <NotificationSettings />
      case 'monitoring':
        return <MonitoringDashboard />
      default:
        return null
    }
  }

  // 需要填充高度的标签页
  const fillHeightTabs: TabType[] = ['users', 'roles', 'audit']
  const shouldFillHeight = activeTab ? fillHeightTabs.includes(activeTab) : false

  if (!tabs.length) {
    return (
      <AppLayout title="系统设置">
        <div className="p-4">
          <div className="bg-card rounded-xl border border-border">
            <EmptyState
              title="暂无可访问的设置模块"
              description="当前账号缺少系统设置相关权限，请联系管理员授权后再访问。"
            />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="系统设置">
      <div className={`p-1 ${shouldFillHeight ? 'h-[calc(100vh-64px)] flex flex-col' : ''}`}>
        {/* 统一的白色容器 */}
        <div className={`bg-card rounded-xl border border-border ${shouldFillHeight ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          {/* 标签导航 */}
          <div className="p-4 border-b border-border">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key

                return (
                  <motion.button
                    key={tab.key}
                    onClick={() => {
                      const params = new URLSearchParams(searchParams?.toString())
                      params.set('tab', tab.key)
                      router.replace(`${pathname}?${params.toString()}`)
                    }}
                    className={`
                      relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-muted/40'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"
                        layoutId="activeTabIndicator"
                      />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* 标签内容 */}
          <motion.div
            key={activeTab || 'empty'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={shouldFillHeight ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}
          >
            {renderTabContent()}
          </motion.div>
        </div>
      </div>
    </AppLayout>
  )
}
