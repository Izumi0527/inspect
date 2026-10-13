import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth, useRequireAuth } from '@/lib/contexts/auth-context'
import { api, TokenManager, markSessionAlive } from '@/lib/api-client'
import { Permission, UserRole, type User } from '@/lib/types/auth.types'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }

// 守卫的跳转目标按 usePathname 判定，测试通过改变 mockPathname 控制所在页面
let mockPathname = '/reports'

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}))

jest.mock('react-hot-toast', () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}))

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client')
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        profile: jest.fn(),
        refresh: jest.fn(),
        login: jest.fn(),
        logout: jest.fn(),
      },
    },
  }
})

const profileMock = api.auth.profile as jest.MockedFunction<typeof api.auth.profile>
const refreshMock = api.auth.refresh as jest.MockedFunction<typeof api.auth.refresh>

const mockUser: User = {
  id: '1',
  username: 'admin',
  email: 'admin@example.com',
  full_name: '管理员',
  role: UserRole.ADMIN,
  permissions: [Permission.REPORTS_READ],
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const GuardedProbe = () => {
  useRequireAuth()
  const { isLoading, isAuthenticated } = useAuth()
  return <span>{isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'anonymous'}</span>
}

const unauthorized = () =>
  new Response(JSON.stringify({ success: false, error: { message: 'Could not validate credentials' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

// 会话被服务端停用（并发会话超限裁剪、管理员强制下线、会话过期等）后 refresh 必然失败。
// 此时必须清掉本地登录态，并由路由守卫把用户送回登录页（带上当前路径），
// 而不是停留在「每次请求都 401」的坏状态里直到手动刷新。
describe('AuthProvider 会话失效处理', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    // api-client 的「会话失效只广播一次」标记是模块级状态，用例之间必须重置
    markSessionAlive()
    mockPush.mockReset()
    mockPathname = '/reports'
    profileMock.mockReset()
    refreshMock.mockReset()
    jest.spyOn(TokenManager, 'clearTokens').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('业务请求续期失败后：清理凭据并跳登录页，带回当前路径', async () => {
    profileMock.mockResolvedValue(mockUser)
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    render(
      <AuthProvider>
        <GuardedProbe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())
    mockPush.mockReset()

    // 走真实链路：业务请求 401 → 续期失败 → 广播会话失效 → 状态转匿名 → 守卫跳登录
    await act(async () => {
      await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    })

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())
    expect(TokenManager.clearTokens).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/reports')}`
    )
  })

  it('已在登录页时跳转不追加 redirect，避免自引用成环', async () => {
    mockPathname = '/login'
    profileMock.mockResolvedValue(mockUser)
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    render(
      <AuthProvider>
        <GuardedProbe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())
    mockPush.mockReset()

    await act(async () => {
      await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    })

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('redirect='))
  })

  it('改密页同样不追加 redirect', async () => {
    mockPathname = '/change-password'
    profileMock.mockResolvedValue(mockUser)
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    render(
      <AuthProvider>
        <GuardedProbe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())
    mockPush.mockReset()

    await act(async () => {
      await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    })

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('redirect='))
  })

  it('续期失败只在首次广播，连续失败不重复清理', async () => {
    profileMock.mockResolvedValue(mockUser)
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    render(
      <AuthProvider>
        <GuardedProbe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())

    await act(async () => {
      await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
      await expect(api.get('/devices', { retry: 0 })).rejects.toBeTruthy()
    })

    expect(TokenManager.clearTokens).toHaveBeenCalledTimes(1)
  })

  it('重新登录后广播标记重置：新会话再次失效仍会广播', async () => {
    profileMock.mockResolvedValue(mockUser)
    global.fetch = jest.fn(async () => unauthorized()) as unknown as typeof fetch

    const LoginProbe = () => {
      const { login } = useAuth()
      return (
        <button onClick={() => void login({ username: 'admin', password: 'secret' })}>
          do-login
        </button>
      )
    }

    render(
      <AuthProvider>
        <LoginProbe />
        <GuardedProbe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())

    // 第一轮：旧会话失效，广播一次
    await act(async () => {
      await expect(api.get('/reports', { retry: 0 })).rejects.toBeTruthy()
    })
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())

    // 重新登录：新会话开始，应重置「只广播一次」的标记
    const loginMock = api.auth.login as jest.MockedFunction<typeof api.auth.login>
    loginMock.mockResolvedValue({ user: mockUser } as Awaited<ReturnType<typeof api.auth.login>>)
    await act(async () => {
      screen.getByRole('button', { name: 'do-login' }).click()
    })
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument())

    // 第二轮：新会话再失效必须再次广播，否则页面会卡在「每次请求都 401」
    await act(async () => {
      await expect(api.get('/devices', { retry: 0 })).rejects.toBeTruthy()
    })

    expect(TokenManager.clearTokens).toHaveBeenCalledTimes(2)
  })
})
