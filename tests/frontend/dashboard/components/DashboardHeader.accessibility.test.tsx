import React from 'react'
import { render, screen } from '@testing-library/react'
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('@/components/atoms', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

jest.mock('@/components/molecules', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

jest.mock('@/features/dashboard/components/NotificationCenter', () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}))

jest.mock('@/features/dashboard/components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}))

jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDeviceSearch: () => ({
    query: '',
    results: [],
    searching: false,
    showResults: false,
    setQuery: jest.fn(),
    clearSearch: jest.fn(),
  }),
}))

describe('DashboardHeader 可访问性', () => {
  it('搜索输入框应提供显式标签和 name 属性', () => {
    render(<DashboardHeader title="告警中心" />)

    const searchInput = screen.getByRole('textbox', { name: '搜索设备' })

    expect(searchInput).toHaveAttribute('id', 'dashboard-device-search-input')
    expect(searchInput).toHaveAttribute('name', 'dashboard-device-search')
  })
})
