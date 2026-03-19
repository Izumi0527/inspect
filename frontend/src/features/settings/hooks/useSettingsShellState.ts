'use client'

import { useMemo } from 'react'
import { useSettingsShellContext } from '@/features/settings/context/SettingsShellContext'
import type { SettingsTabCapabilities, SettingsTabKey } from '@/features/settings/types/shell.types'

interface SettingsShellState {
  activeTabKey: SettingsTabKey | null
  activeTabCapabilities: SettingsTabCapabilities | undefined
  capabilitiesByTab: Partial<Record<SettingsTabKey, SettingsTabCapabilities>>
}

export const useSettingsShellState = (): SettingsShellState => {
  const { activeTabKey, capabilitiesByTab } = useSettingsShellContext()

  const activeTabCapabilities = useMemo(() => {
    if (!activeTabKey) return undefined
    return capabilitiesByTab[activeTabKey]
  }, [activeTabKey, capabilitiesByTab])

  return {
    activeTabKey,
    capabilitiesByTab,
    activeTabCapabilities,
  }
}

