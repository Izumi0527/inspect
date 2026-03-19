'use client'

import { useCallback, useMemo } from 'react'
import type {
  SettingsTabCapabilities,
  SettingsTabDescriptor,
  SettingsTabKey,
} from '@/features/settings/types/shell.types'

interface UseSettingsLeaveGuardOptions {
  activeTab: SettingsTabDescriptor | null
  activeTabCapabilities: SettingsTabCapabilities | undefined
}

interface SettingsLeaveGuardState {
  shouldBlockLeave: boolean
  confirmLeaveIfNeeded: (nextTabKey: SettingsTabKey) => boolean
}

export const useSettingsLeaveGuard = ({
  activeTab,
  activeTabCapabilities,
}: UseSettingsLeaveGuardOptions): SettingsLeaveGuardState => {
  const shouldBlockLeave = useMemo(() => {
    if (!activeTab) return false
    if (activeTabCapabilities?.blockLeave) return true
    if (activeTab.supportsLeaveGuard && activeTabCapabilities?.dirty) return true
    return false
  }, [activeTab, activeTabCapabilities?.blockLeave, activeTabCapabilities?.dirty])

  const confirmLeaveIfNeeded = useCallback(
    (nextTabKey: SettingsTabKey): boolean => {
      if (!activeTab) return true
      if (nextTabKey === activeTab.key) return true
      if (!shouldBlockLeave) return true

      return window.confirm('当前页面有未保存的更改，确定要离开吗？')
    },
    [activeTab, shouldBlockLeave]
  )

  return {
    shouldBlockLeave,
    confirmLeaveIfNeeded,
  }
}

