import React from 'react'
import { render, screen } from '@testing-library/react'

import { Sidebar } from '@/features/dashboard/components/layout/Sidebar'

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/hooks/useDatetimePreferencesSync', () => ({
  useDisplayPreferences: () => ({ data: undefined }),
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
    expect(inactiveLink.className).toContain('text-muted-foreground')
    expect(inactiveLink.className).toContain('hover:bg-surface-3')

    expect(activeLink.className).not.toContain('bg-blue-50')
    expect(activeLink.className).not.toContain('text-blue-600')
    expect(activeLink.className).not.toContain('border-blue-600')
    expect(activeLink.className).toContain('bg-primary/10')
    expect(activeLink.className).toContain('font-medium')
  })
})
