'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  applyDarkThemeVariant,
  DEFAULT_DARK_THEME_VARIANT,
  normalizeDarkThemeVariant,
  persistDarkThemeVariant,
  readDarkThemeVariant,
  type DarkThemeVariant,
} from '@/lib/theme/dark-theme-variant'

interface ThemeSettingsContextType {
  darkThemeVariant: DarkThemeVariant
  setDarkThemeVariant: (variant: DarkThemeVariant) => void
}

const ThemeSettingsContext = createContext<ThemeSettingsContextType | undefined>(undefined)

export function ThemeSettingsProvider({ children }: { children: React.ReactNode }) {
  const [darkThemeVariant, setDarkThemeVariantState] = useState<DarkThemeVariant>(
    DEFAULT_DARK_THEME_VARIANT
  )

  useEffect(() => {
    const variant = readDarkThemeVariant()
    setDarkThemeVariantState(variant)
    applyDarkThemeVariant(variant)
  }, [])

  const setDarkThemeVariant = (variant: DarkThemeVariant) => {
    const normalizedVariant = normalizeDarkThemeVariant(variant)
    setDarkThemeVariantState(normalizedVariant)
    applyDarkThemeVariant(normalizedVariant)
    persistDarkThemeVariant(normalizedVariant)
  }

  const contextValue = useMemo(
    () => ({
      darkThemeVariant,
      setDarkThemeVariant,
    }),
    [darkThemeVariant]
  )

  return (
    <ThemeSettingsContext.Provider value={contextValue}>
      {children}
    </ThemeSettingsContext.Provider>
  )
}

export function useThemeSettings(): ThemeSettingsContextType {
  const context = useContext(ThemeSettingsContext)
  if (context === undefined) {
    throw new Error('useThemeSettings must be used within a ThemeSettingsProvider')
  }

  return context
}
