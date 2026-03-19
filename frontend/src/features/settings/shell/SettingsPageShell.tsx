'use client'

import React, { useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout'
import { EmptyState } from '@/features/settings/components/shared/EmptyState'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { settingsTabRegistry } from '@/features/settings/registry/settings-tabs'
import type { SettingsTabDescriptor } from '@/features/settings/types/shell.types'
import { useSettingsTabNavigation } from '@/features/settings/hooks/useSettingsTabNavigation'
import { SettingsWorkbenchCard } from '@/features/settings/shell/SettingsWorkbenchCard'
import { SettingsContentViewport } from '@/features/settings/shell/SettingsContentViewport'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { useSettingsLeaveGuard } from '@/features/settings/hooks/useSettingsLeaveGuard'
import { SettingsLeaveGuard } from '@/features/settings/shell/SettingsLeaveGuard'
import { SettingsTabNav } from '@/features/settings/shell/SettingsTabNav'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'
import { SettingsStatusBannerStack } from '@/features/settings/shell/SettingsStatusBannerStack'

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
    <SettingsShellProvider activeTabKey={activeTab?.key ?? null}>
      <SettingsPageShellLayout
        visibleTabs={visibleTabs}
        activeTab={activeTab}
        onTabSelect={onTabSelect}
      />
    </SettingsShellProvider>
  )
}

const SettingsPageShellLayout: React.FC<{
  visibleTabs: SettingsTabDescriptor[]
  activeTab: SettingsTabDescriptor | null
  onTabSelect: (tabKey: SettingsTabDescriptor['key']) => void
}> = ({ visibleTabs, activeTab, onTabSelect }) => {
  const { activeTabCapabilities } = useSettingsShellState()
  const { confirmLeaveIfNeeded } = useSettingsLeaveGuard({
    activeTab,
    activeTabCapabilities,
  })

  const handleTabSelect = useCallback(
    (tabKey: SettingsTabDescriptor['key']) => {
      if (!confirmLeaveIfNeeded(tabKey)) return
      onTabSelect(tabKey)
    },
    [confirmLeaveIfNeeded, onTabSelect]
  )

  const shouldFillHeight = activeTab?.scrollMode === 'panel'
  const ActiveTabComponent = activeTab?.component ?? null

  return (
    <AppLayout title="系统设置">
      <SettingsLeaveGuard activeTab={activeTab} />
      <div
        className={`p-1 ${
          shouldFillHeight ? 'h-[calc(100vh-64px)] flex flex-col' : ''
        }`}
      >
        <SettingsWorkbenchCard fillHeight={shouldFillHeight}>
          <SettingsTabNav
            tabs={visibleTabs}
            activeKey={activeTab?.key ?? visibleTabs[0].key}
            onSelect={handleTabSelect}
          />

          <SettingsStatusBannerStack
            banners={activeTabCapabilities?.banners ?? []}
          />

          <SettingsStatsStrip stats={activeTabCapabilities?.stats ?? []} />

          <SettingsToolbar
            toolbar={activeTabCapabilities?.toolbar}
            primaryActions={activeTabCapabilities?.primaryActions}
            secondaryActions={activeTabCapabilities?.secondaryActions}
          />

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
