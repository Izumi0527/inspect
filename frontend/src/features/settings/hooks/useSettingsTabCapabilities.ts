'use client'

import React, { useEffect, useMemo } from 'react'
import { useSettingsShellContext } from '@/features/settings/context/SettingsShellContext'
import type { SettingsTabCapabilities, SettingsTabKey } from '@/features/settings/types/shell.types'

const buildCapabilitiesFingerprint = (capabilities: SettingsTabCapabilities): string => {
  const stripNonSerializable = (value: unknown): unknown => {
    if (typeof value === 'function') return '__fn__'
    if (typeof value === 'bigint') return value.toString()
    if (React.isValidElement(value)) return '__element__'

    if (Array.isArray(value)) return value.map(stripNonSerializable)

    if (value && typeof value === 'object') {
      // React.forwardRef / memo 等组件对象，避免深层遍历导致无意义抖动
      if ('$$typeof' in (value as Record<string, unknown>)) return '__react__'

      const record = value as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(record)) {
        result[key] = stripNonSerializable(record[key])
      }
      return result
    }

    return value
  }

  try {
    return JSON.stringify(stripNonSerializable(capabilities))
  } catch {
    return '__unserializable__'
  }
}

export const useSettingsTabCapabilities = (
  tabKey: SettingsTabKey,
  capabilities: SettingsTabCapabilities
) => {
  const { setCapabilities, clearCapabilities } = useSettingsShellContext()

  const fingerprint = useMemo(
    () => buildCapabilitiesFingerprint(capabilities),
    [capabilities]
  )

  useEffect(() => {
    setCapabilities(tabKey, capabilities)
    return () => {
      clearCapabilities(tabKey)
    }
    // fingerprint 是 capabilities 的稳定快照（忽略函数/ReactElement），避免无限重渲染
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearCapabilities, fingerprint, setCapabilities, tabKey])
}
