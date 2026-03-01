import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeToggle } from '@/components/molecules/ThemeToggle'
import { ThemeSettingsProvider } from '@/lib/contexts/theme-context'

const mockSetTheme = jest.fn()

jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: mockSetTheme,
    systemTheme: 'dark',
  }),
}))

describe('ThemeToggle', () => {
  afterEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-dark-variant')
  })

  it('应展示深色风格选项并包含 VS Code Dark Modern', async () => {
    const user = userEvent.setup()
    render(
      <ThemeSettingsProvider>
        <ThemeToggle />
      </ThemeSettingsProvider>
    )

    const button = await screen.findByRole('button', { name: '主题设置' })
    await waitFor(() => expect(button).not.toBeDisabled())

    await user.click(button)

    expect(screen.getByText('深色风格')).toBeInTheDocument()
    expect(screen.getByText('VS Code Dark Modern')).toBeInTheDocument()
  })

  it('切换深色风格后应写入 localStorage 并更新 html 属性', async () => {
    const user = userEvent.setup()
    render(
      <ThemeSettingsProvider>
        <ThemeToggle />
      </ThemeSettingsProvider>
    )

    const button = await screen.findByRole('button', { name: '主题设置' })
    await waitFor(() => expect(button).not.toBeDisabled())
    await user.click(button)

    await user.click(screen.getByText('经典紫色风格'))

    expect(window.localStorage.getItem('theme.darkVariant')).toBe('legacy')
    expect(document.documentElement.dataset.darkVariant).toBe('legacy')
  })
})
