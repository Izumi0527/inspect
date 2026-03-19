'use client'

import React, { useEffect } from 'react'
import type { SettingsTabDescriptor } from '@/features/settings/types/shell.types'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'
import { useSettingsLeaveGuard } from '@/features/settings/hooks/useSettingsLeaveGuard'

interface SettingsLeaveGuardProps {
  activeTab: SettingsTabDescriptor | null
}

export const SettingsLeaveGuard: React.FC<SettingsLeaveGuardProps> = ({ activeTab }) => {
  const { activeTabCapabilities } = useSettingsShellState()
  const { shouldBlockLeave } = useSettingsLeaveGuard({
    activeTab,
    activeTabCapabilities,
  })

  useEffect(() => {
    if (!shouldBlockLeave) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlockLeave])

  return null
}

