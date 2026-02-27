import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationCenter } from '@/features/dashboard/components/NotificationCenter'

const mockFetchDashboardNotifications = jest.fn()
const mockFetchDashboardNotificationsWithMeta = jest.fn()
const mockMarkNotificationsRead = jest.fn()
const mockDismissNotifications = jest.fn()
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('@/features/dashboard/api/dashboard.api', () => ({
  fetchDashboardNotifications: (...args: unknown[]) => mockFetchDashboardNotifications(...args),
  fetchDashboardNotificationsWithMeta: (...args: unknown[]) => mockFetchDashboardNotificationsWithMeta(...args),
  markDashboardNotificationsRead: (...args: unknown[]) => mockMarkNotificationsRead(...args),
  dismissDashboardNotifications: (...args: unknown[]) => mockDismissNotifications(...args),
}))

const renderWithQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      {ui}
    </QueryClientProvider>
  )
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      lastUpdated: new Date(),
    })
    mockMarkNotificationsRead.mockResolvedValue({ updated: 0 })
    mockDismissNotifications.mockResolvedValue({ updated: 0 })
    mockPush.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('点击“全部已读”应调用后端 read 接口', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('全部已读'))

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({ all: true, window_limit: 200 })
  })

  it('点击“清空”应调用后端 dismiss 接口', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('清空'))

    expect(mockDismissNotifications).toHaveBeenCalledWith({ all: true, window_limit: 200 })
  })
})
