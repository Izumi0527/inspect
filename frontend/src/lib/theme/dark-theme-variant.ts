export type DarkThemeVariant = 'vscode' | 'legacy'

export const DARK_THEME_VARIANT_STORAGE_KEY = 'theme.darkVariant'
export const DEFAULT_DARK_THEME_VARIANT: DarkThemeVariant = 'vscode'

export function normalizeDarkThemeVariant(
  value: DarkThemeVariant | string | null | undefined
): DarkThemeVariant {
  return value === 'legacy' ? 'legacy' : DEFAULT_DARK_THEME_VARIANT
}

export function readDarkThemeVariant(): DarkThemeVariant {
  if (typeof window === 'undefined') {
    return DEFAULT_DARK_THEME_VARIANT
  }

  const storedValue = window.localStorage.getItem(DARK_THEME_VARIANT_STORAGE_KEY)
  return normalizeDarkThemeVariant(storedValue)
}

export function persistDarkThemeVariant(variant: DarkThemeVariant): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(DARK_THEME_VARIANT_STORAGE_KEY, variant)
}

export function applyDarkThemeVariant(variant: DarkThemeVariant): void {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.darkVariant = variant
}
