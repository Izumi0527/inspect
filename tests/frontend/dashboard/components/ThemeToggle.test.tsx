import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeToggle } from '@/components/molecules/ThemeToggle'

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
  })

  it('应展示主题入口并提供统一的暗色主题选项', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    const button = await screen.findByRole('button', { name: '主题' })
    await waitFor(() => expect(button).not.toBeDisabled())

    await user.click(button)

    expect(screen.getByText('暗色主题')).toBeInTheDocument()
    expect(screen.queryByText('深色风格')).not.toBeInTheDocument()
    expect(screen.queryByText('VS Code Dark Modern')).not.toBeInTheDocument()
  })

  it('切换暗色主题后应调用 next-themes 的 setTheme', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    const button = await screen.findByRole('button', { name: '主题' })
    await waitFor(() => expect(button).not.toBeDisabled())
    await user.click(button)

    await user.click(screen.getByText('暗色主题'))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })
})
