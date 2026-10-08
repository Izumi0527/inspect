import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/molecules/ThemeToggle'

const mockSetTheme = jest.fn()
const mockSetSkin = jest.fn()
let currentSkin: 'classic' | 'instrument' | 'glass' = 'classic'

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: mockSetTheme, systemTheme: 'light' }),
}))

jest.mock('@/lib/contexts/skin-context', () => ({
  useSkin: () => ({ skin: currentSkin, setSkin: mockSetSkin }),
}))

describe('ThemeToggle · 浅色玻璃拟态', () => {
  beforeEach(() => {
    mockSetTheme.mockReset()
    mockSetSkin.mockReset()
    currentSkin = 'classic'
  })

  it('提供第三个皮肤项，点击后写入 glass', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(await screen.findByRole('button', { name: '主题' }))
    await user.click(screen.getByRole('menuitem', { name: '浅色玻璃拟态' }))

    expect(mockSetSkin).toHaveBeenCalledWith('glass')
  })

  it('处于 glass 时禁用暗色与跟随系统并给出提示', async () => {
    currentSkin = 'glass'
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(await screen.findByRole('button', { name: '主题' }))

    expect(screen.getByRole('menuitem', { name: '暗色主题' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: '跟随系统' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: '浅色主题' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByText('浅色玻璃拟态恒为浅色')).toBeInTheDocument()
  })

  it('处于 classic 时暗色项可用且无提示', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(await screen.findByRole('button', { name: '主题' }))

    expect(screen.getByRole('menuitem', { name: '暗色主题' })).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText('浅色玻璃拟态恒为浅色')).not.toBeInTheDocument()
  })
})
