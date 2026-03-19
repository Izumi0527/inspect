'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { SettingsTabCapabilities, SettingsTabKey } from '@/features/settings/types/shell.types'

interface SettingsShellContextValue {
  activeTabKey: SettingsTabKey | null
  capabilitiesByTab: Partial<Record<SettingsTabKey, SettingsTabCapabilities>>
  setCapabilities: (tabKey: SettingsTabKey, caps: SettingsTabCapabilities) => void
  clearCapabilities: (tabKey: SettingsTabKey) => void
}

const SettingsShellContext = createContext<SettingsShellContextValue | null>(null)

interface SettingsShellProviderProps {
  activeTabKey: SettingsTabKey | null
  children: React.ReactNode
}

export const SettingsShellProvider: React.FC<SettingsShellProviderProps> = ({
  activeTabKey,
  children,
}) => {
  const [capabilitiesByTab, setCapabilitiesByTab] = useState<
    Partial<Record<SettingsTabKey, SettingsTabCapabilities>>
  >({})

  const setCapabilities = useCallback(
    (tabKey: SettingsTabKey, caps: SettingsTabCapabilities) => {
      setCapabilitiesByTab((prev) => ({
        ...prev,
        [tabKey]: caps,
      }))
    },
    []
  )

  const clearCapabilities = useCallback((tabKey: SettingsTabKey) => {
    setCapabilitiesByTab((prev) => {
      if (!prev[tabKey]) return prev
      const next = { ...prev }
      delete next[tabKey]
      return next
    })
  }, [])

  const value = useMemo<SettingsShellContextValue>(
    () => ({
      activeTabKey,
      capabilitiesByTab,
      setCapabilities,
      clearCapabilities,
    }),
    [activeTabKey, capabilitiesByTab, clearCapabilities, setCapabilities]
  )

  return (
    <SettingsShellContext.Provider value={value}>
      {children}
    </SettingsShellContext.Provider>
  )
}

export const useSettingsShellContext = (): SettingsShellContextValue => {
  const context = useContext(SettingsShellContext)
  if (!context) {
    throw new Error('useSettingsShellContext must be used within a SettingsShellProvider')
  }
  return context
}

