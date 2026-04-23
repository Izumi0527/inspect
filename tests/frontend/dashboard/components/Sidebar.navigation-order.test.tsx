import React from 'react'
import { render, screen } from '@testing-library/react'

import { Sidebar } from '@/features/dashboard/components/Sidebar'

const mockUsePermission = jest.fn()

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: (permission: unknown) => mockUsePermission(permission),
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    type = 'button',
    ...props
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    type?: 'button' | 'submit' | 'reset'
    [key: string]: unknown
  }) => (
    <button type={type} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

describe('Sidebar 导航顺序', () => {
  beforeEach(() => {
    mockUsePermission.mockReset()
    mockUsePermission.mockReturnValue(true)
  })

  it('应将监控中心排在设备管理之前', () => {
    render(<Sidebar isOpen onToggle={jest.fn()} currentPath="/dashboard" />)

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.trim())
      .filter(Boolean)

    expect(labels).toContain('监控中心')
    expect(labels).toContain('设备管理')
    expect(labels.indexOf('监控中心')).toBeLessThan(labels.indexOf('设备管理'))
  })
})
