'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { allSettingsTabKeys } from '@/features/settings/registry/settings-tabs'
import type { SettingsTabDescriptor, SettingsTabKey } from '@/features/settings/types/shell.types'

interface UseSettingsTabNavigationOptions {
  tabs: SettingsTabDescriptor[]
}

interface SettingsTabNavigationState {
  requestedTabKey: SettingsTabKey | null
  activeTab: SettingsTabDescriptor | null
  onTabSelect: (tabKey: SettingsTabKey) => void
}

export const useSettingsTabNavigation = ({
  tabs,
}: UseSettingsTabNavigationOptions): SettingsTabNavigationState => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabParam = useMemo(() => {
    const value = searchParams?.get('tab')
    return value ? value.trim() : ''
  }, [searchParams])

  const requestedTabKey: SettingsTabKey | null = useMemo(() => {
    if (!tabParam) return null
    return allSettingsTabKeys.includes(tabParam as SettingsTabKey)
      ? (tabParam as SettingsTabKey)
      : null
  }, [tabParam])

  const activeTab = useMemo<SettingsTabDescriptor | null>(() => {
    if (!tabs.length) return null
    if (!requestedTabKey) return tabs[0]
    return tabs.find((tab) => tab.key === requestedTabKey) ?? tabs[0]
  }, [requestedTabKey, tabs])

  // 纠偏 URL：非法/不可见 tab 统一替换为当前可见的默认 tab
  useEffect(() => {
    if (!activeTab) return
    if (requestedTabKey === activeTab.key) return

    const params = new URLSearchParams(searchParams?.toString())
    params.set('tab', activeTab.key)
    router.replace(`${pathname}?${params.toString()}`)
  }, [activeTab, pathname, requestedTabKey, router, searchParams])

  const onTabSelect = useCallback(
    (tabKey: SettingsTabKey) => {
      if (!activeTab) return
      if (tabKey === activeTab.key) return
      if (!tabs.some((tab) => tab.key === tabKey)) return

      const params = new URLSearchParams(searchParams?.toString())
      params.set('tab', tabKey)
      router.push(`${pathname}?${params.toString()}`)
    },
    [activeTab, pathname, router, searchParams, tabs]
  )

  return {
    requestedTabKey,
    activeTab,
    onTabSelect,
  }
}

