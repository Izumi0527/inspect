import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/molecules/ThemeToggle'

const mockSetTheme = jest.fn()

jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: mockSetTheme,
    systemTheme: 'light',
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockReset()
  })

  it('使用“主题”作为入口文案，并只提供统一的暗色主题选项', async () => {
    const user = userEvent.setup()

    render(<ThemeToggle />)

    const trigger = await screen.findByRole('button', { name: '主题' })
    expect(trigger).toHaveAttribute('title', '主题')

    await user.click(trigger)

    expect(screen.getByRole('menuitem', { name: '浅色主题' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '暗色主题' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '跟随系统' })).toBeInTheDocument()

    expect(screen.queryByText('深色主题')).not.toBeInTheDocument()
    expect(screen.queryByText('深色风格')).not.toBeInTheDocument()
    expect(screen.queryByText('经典紫色风格')).not.toBeInTheDocument()
    expect(screen.queryByText('VS Code Dark Modern')).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: '暗色主题' }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })
})
