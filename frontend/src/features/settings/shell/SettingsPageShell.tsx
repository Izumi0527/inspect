'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AppLayout } from '@/components/layout'
import { EmptyState } from '@/features/settings/components/shared/EmptyState'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { settingsTabRegistry } from '@/features/settings/registry/settings-tabs'
import type { SettingsTabDescriptor } from '@/features/settings/types/shell.types'
import { useSettingsTabNavigation } from '@/features/settings/hooks/useSettingsTabNavigation'
import { SettingsWorkbenchCard } from '@/features/settings/shell/SettingsWorkbenchCard'
import { SettingsContentViewport } from '@/features/settings/shell/SettingsContentViewport'

export const SettingsPageShell: React.FC = () => {
  // 标签页可见性（按最小权限控制，避免用户进入后再看到 403）
  const canConfigSystem = usePermission(Permission.SYSTEM_CONFIG)
  const canReadUsers = usePermission(Permission.USERS_READ)
  const canReadAudit = usePermission(Permission.SYSTEM_LOGS)
  const canReadMonitoring = usePermission(Permission.MONITORING_READ)

  const permissionMap = useMemo<Partial<Record<Permission, boolean>>>(
    () => ({
      [Permission.SYSTEM_CONFIG]: canConfigSystem,
      [Permission.USERS_READ]: canReadUsers,
      [Permission.SYSTEM_LOGS]: canReadAudit,
      [Permission.MONITORING_READ]: canReadMonitoring,
    }),
    [canConfigSystem, canReadUsers, canReadAudit, canReadMonitoring]
  )

  const visibleTabs: SettingsTabDescriptor[] = useMemo(
    () =>
      settingsTabRegistry.filter((tab) =>
        tab.requiredPermissions.every(
          (permission) => permissionMap[permission] ?? false
        )
      ),
    [permissionMap]
  )

  const { activeTab, onTabSelect } = useSettingsTabNavigation({ tabs: visibleTabs })

  const shouldFillHeight = activeTab?.scrollMode === 'panel'
  const ActiveTabComponent = activeTab?.component ?? null

  if (!visibleTabs.length) {
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
      <div
        className={`p-1 ${
          shouldFillHeight ? 'h-[calc(100vh-64px)] flex flex-col' : ''
        }`}
      >
        <SettingsWorkbenchCard fillHeight={shouldFillHeight}>
          {/* 标签导航 */}
          <div className="p-4 border-b border-border">
            <div className="flex flex-wrap gap-2">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab?.key === tab.key

                return (
                  <motion.button
                    key={tab.key}
                    onClick={() => onTabSelect(tab.key)}
                    className={`
                      relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${
                        isActive
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
          {activeTab ? (
            <SettingsContentViewport
              tabKey={activeTab.key}
              scrollMode={activeTab.scrollMode}
            >
              {ActiveTabComponent ? <ActiveTabComponent /> : null}
            </SettingsContentViewport>
          ) : null}
        </SettingsWorkbenchCard>
      </div>
    </AppLayout>
  )
}

