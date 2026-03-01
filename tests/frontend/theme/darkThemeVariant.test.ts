import {
  DEFAULT_DARK_THEME_VARIANT,
  applyDarkThemeVariant,
  normalizeDarkThemeVariant,
  type DarkThemeVariant,
} from '@/lib/theme/dark-theme-variant'

describe('dark-theme-variant', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-dark-variant')
  })

  it('默认回退到 vscode', () => {
    expect(DEFAULT_DARK_THEME_VARIANT).toBe('vscode')
    expect(normalizeDarkThemeVariant(undefined)).toBe('vscode')
    expect(normalizeDarkThemeVariant('' as unknown as DarkThemeVariant)).toBe('vscode')
  })

  it('保留合法值并写入 html data 属性', () => {
    expect(normalizeDarkThemeVariant('legacy')).toBe('legacy')

    applyDarkThemeVariant('legacy')
    expect(document.documentElement.dataset.darkVariant).toBe('legacy')

    applyDarkThemeVariant('vscode')
    expect(document.documentElement.dataset.darkVariant).toBe('vscode')
  })
})
