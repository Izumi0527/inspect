'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface SyncedCrosshairContextValue {
  hoveredTimestampMs: number | null
  setHoveredTimestampMs: (timestampMs: number | null) => void
}

const DEFAULT_CONTEXT: SyncedCrosshairContextValue = {
  hoveredTimestampMs: null,
  setHoveredTimestampMs: () => undefined,
}

const SyncedCrosshairContext = createContext<SyncedCrosshairContextValue>(DEFAULT_CONTEXT)

export function SyncedCrosshairProvider({ children }: { children: ReactNode }) {
  const [hoveredTimestampMs, setHoveredTimestampMs] = useState<number | null>(null)
  const value = useMemo(
    () => ({ hoveredTimestampMs, setHoveredTimestampMs }),
    [hoveredTimestampMs]
  )
  return (
    <SyncedCrosshairContext.Provider value={value}>
      {children}
    </SyncedCrosshairContext.Provider>
  )
}

export function useSyncedCrosshair(): SyncedCrosshairContextValue {
  return useContext(SyncedCrosshairContext)
}
