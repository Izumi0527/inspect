import React from 'react'
import { render, screen } from '@testing-library/react'

import { Sidebar } from '@/features/dashboard/components/Sidebar'

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

describe('Dashboard Sidebar', () => {
  it('为导航项使用主题变量样式，而不是浅色硬编码类', () => {
    render(
      <Sidebar
        isOpen
        onToggle={jest.fn()}
        currentPath="/settings"
      />
    )

    const inactiveLink = screen.getByRole('link', { name: /监控中心/i })
    const activeLink = screen.getByRole('link', { name: /系统设置/i })

    expect(inactiveLink.className).not.toContain('text-gray-700')
    expect(inactiveLink.className).not.toContain('hover:bg-blue-50')
    expect(inactiveLink.className).toContain('text-foreground/88')
    expect(inactiveLink.className).toContain('hover:bg-muted/70')

    expect(activeLink.className).not.toContain('bg-blue-50')
    expect(activeLink.className).not.toContain('text-blue-600')
    expect(activeLink.className).not.toContain('border-blue-600')
    expect(activeLink.className).toContain('bg-primary/12')
    expect(activeLink.className).toContain('text-primary')
    expect(activeLink.className).toContain('border-primary')
  })
})
