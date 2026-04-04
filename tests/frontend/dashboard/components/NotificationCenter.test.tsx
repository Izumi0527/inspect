import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationCenter } from '@/features/dashboard/components/NotificationCenter'

let mockUserId = 'user-1'

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: mockUserId },
  }),
  usePermission: () => true,
}))

const mockFetchDashboardNotifications = jest.fn()
const mockFetchDashboardNotificationsWithMeta = jest.fn()
const mockMarkNotificationsRead = jest.fn()
const mockDismissNotifications = jest.fn()
const mockPush = jest.fn()
const mockToastError = jest.fn()

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

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const renderWithQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        {ui}
      </QueryClientProvider>
    ),
  }
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    mockUserId = 'user-1'
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      lastUpdated: new Date(),
    })
    mockMarkNotificationsRead.mockResolvedValue({ updated: 0 })
    mockDismissNotifications.mockResolvedValue({ updated: 0 })
    mockPush.mockClear()
    mockToastError.mockClear()
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

  it('通知查询缓存键应包含当前用户 ID，避免不同账号串用缓存', async () => {
    const { client } = renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
    })

    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toContainEqual([
      'dashboardNotifications',
      'user-1',
      20,
    ])
  })

  it('通知加载失败时应展示明确错误态，而不是伪装成空通知', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockRejectedValueOnce(new Error('notifications failed'))

    renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button'))

    expect(await screen.findByText('通知加载失败')).toBeInTheDocument()
    expect(
      screen.getByText('当前无法获取最新通知，请检查网络或稍后重试。')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试加载通知' })).toBeInTheDocument()
  })
})
