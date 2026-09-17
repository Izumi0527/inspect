import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationCenter } from '@/features/dashboard/components/NotificationCenter'
import type { Notification } from '@/types/notification'

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

let capturedRealtimeRefresh: (() => void) | null = null
let capturedRealtimeEnabled: boolean | null = null

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

jest.mock('@/features/dashboard/hooks/useDashboard', () => ({
  useDashboardAlertRealtimeRefresh: (refresh: () => void, enabled: boolean) => {
    capturedRealtimeRefresh = refresh
    capturedRealtimeEnabled = enabled
  },
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

const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'alert-7',
  type: 'alert',
  title: '告警：core-sw-01',
  content: 'CPU 使用率超过阈值',
  timestamp: '2026-09-17T10:00:00Z',
  read: false,
  severity: 'critical',
  link: '/alerts?id=7',
  ...overrides,
})

const emptyResult = () => ({
  notifications: [],
  unreadCount: 0,
  lastUpdated: new Date(),
})

const openBell = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => {
    expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
  })
  await user.click(screen.getByRole('button', { name: /通知中心/ }))
  await screen.findByText('全部已读')
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    mockUserId = 'user-1'
    capturedRealtimeRefresh = null
    capturedRealtimeEnabled = null
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue(emptyResult())
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

    await openBell(user)
    await user.click(screen.getByText('全部已读'))

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({ all: true, window_limit: 200 })
  })

  it('点击“清空”应调用后端 dismiss 接口', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)

    await openBell(user)
    await user.click(screen.getByText('清空'))

    expect(mockDismissNotifications).toHaveBeenCalledWith({ all: true, window_limit: 200 })
  })

  it('通知查询缓存键应包含当前用户 ID 与标签页，避免不同账号串用缓存', async () => {
    const { client } = renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalled()
    })

    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toContainEqual([
      'dashboardNotifications',
      'user-1',
      20,
      'all',
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

  it('切换到“消息”标签页应按 type=system 单独向后端拉取，而不是在 20 条窗口里前端过滤', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockImplementation(async (_limit: number, type?: string) => {
      if (type === 'system') {
        return {
          notifications: [
            buildNotification({ id: 'report-9', type: 'system', title: '报表生成完成', link: '/reports', severity: 'success' }),
          ],
          unreadCount: 1,
          lastUpdated: new Date(),
        }
      }
      return {
        notifications: [buildNotification()],
        unreadCount: 1,
        lastUpdated: new Date(),
      }
    })

    renderWithQuery(<NotificationCenter />)
    await openBell(user)
    await user.click(screen.getByText('消息'))

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalledWith(20, 'system')
    })
    expect(await screen.findByText('报表生成完成')).toBeInTheDocument()
    expect(screen.queryByText('告警：core-sw-01')).not.toBeInTheDocument()
  })

  it('“消息”页点“清空”应只清空系统消息（payload 带 type=system）', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)

    await openBell(user)
    await user.click(screen.getByText('消息'))
    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalledWith(20, 'system')
    })
    await screen.findByText('暂无最近系统通知')

    await user.click(screen.getByText('清空'))

    expect(mockDismissNotifications).toHaveBeenCalledWith({ all: true, window_limit: 200, type: 'system' })
  })

  it('“告警”页点“全部已读”应只作用于告警（payload 带 type=alert）', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)

    await openBell(user)
    await user.click(screen.getByText('告警'))
    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalledWith(20, 'alert')
    })
    await screen.findByText('暂无最近告警')

    await user.click(screen.getByText('全部已读'))

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({ all: true, window_limit: 200, type: 'alert' })
  })

  it('点击带链接的未读通知应标记已读、关闭菜单并跳转', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue({
      notifications: [buildNotification()],
      unreadCount: 1,
      lastUpdated: new Date(),
    })

    renderWithQuery(<NotificationCenter />)
    await openBell(user)
    await user.click(await screen.findByText('告警：core-sw-01'))

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({ ids: ['alert-7'] })
    expect(mockPush).toHaveBeenCalledWith('/alerts?id=7')
    await waitFor(() => {
      expect(screen.queryByText('全部已读')).not.toBeInTheDocument()
    })
  })

  it('点击已读通知不应再次调用 read 接口', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue({
      notifications: [buildNotification({ read: true })],
      unreadCount: 0,
      lastUpdated: new Date(),
    })

    renderWithQuery(<NotificationCenter />)
    await openBell(user)
    await user.click(await screen.findByText('告警：core-sw-01'))

    expect(mockMarkNotificationsRead).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/alerts?id=7')
  })

  it('告警实时事件应触发通知重新拉取，且订阅受告警权限门控', async () => {
    renderWithQuery(<NotificationCenter />)

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalledTimes(1)
    })
    expect(capturedRealtimeEnabled).toBe(true)
    expect(capturedRealtimeRefresh).not.toBeNull()

    capturedRealtimeRefresh?.()

    await waitFor(() => {
      expect(mockFetchDashboardNotificationsWithMeta).toHaveBeenCalledTimes(2)
    })
  })

  it('“消息”页不应显示前往告警中心的入口', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockImplementation(async (_limit: number, type?: string) => ({
      notifications: [
        type === 'system'
          ? buildNotification({ id: 'report-9', type: 'system', title: '报表生成完成', link: '/reports' })
          : buildNotification(),
      ],
      unreadCount: 1,
      lastUpdated: new Date(),
    }))

    renderWithQuery(<NotificationCenter onViewAll={jest.fn()} />)
    await openBell(user)
    expect(await screen.findByText('前往告警中心')).toBeInTheDocument()

    await user.click(screen.getByText('消息'))
    await screen.findByText('报表生成完成')

    expect(screen.queryByText('前往告警中心')).not.toBeInTheDocument()
  })

  it('通知项应是可用键盘触发的按钮：Enter 标记已读并跳转', async () => {
    const user = userEvent.setup()
    mockFetchDashboardNotificationsWithMeta.mockResolvedValue({
      notifications: [buildNotification()],
      unreadCount: 1,
      lastUpdated: new Date(),
    })

    renderWithQuery(<NotificationCenter />)
    await openBell(user)

    const item = await screen.findByRole('button', { name: /告警：core-sw-01/ })
    expect(item.className).not.toMatch(/\/\d+\/\d+/)

    item.focus()
    await user.keyboard('{Enter}')

    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({ ids: ['alert-7'] })
    expect(mockPush).toHaveBeenCalledWith('/alerts?id=7')
  })

  it('面板应是带名称的 dialog，批量操作与标签页可通过 Tab 到达', async () => {
    const user = userEvent.setup()
    renderWithQuery(<NotificationCenter />)
    await openBell(user)

    expect(screen.getByRole('dialog', { name: '通知中心' })).toBeInTheDocument()

    const reachable = new Set<string>()
    for (let i = 0; i < 6; i += 1) {
      await user.tab()
      reachable.add(document.activeElement?.textContent?.trim() ?? '')
    }
    expect([...reachable]).toEqual(expect.arrayContaining(['全部已读', '清空', '全部', '告警', '消息']))
  })
})
