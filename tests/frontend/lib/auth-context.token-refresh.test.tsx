import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/lib/contexts/auth-context'
import { api } from '@/lib/api-client'
import { Permission, UserRole, type User } from '@/lib/types/auth.types'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }

// AuthProvider 依据 pathname 决定是否做认证探测（公开页跳过），故需连同 usePathname 一起 mock。
let mockPathname = '/dashboard'

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
  permissions: [Permission.INSPECTIONS_READ, Permission.INSPECTIONS_UPDATE],
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const AuthProbe = () => {
  const { isAuthenticated, isLoading } = useAuth()
  return (
    <div>
      <span>{isLoading ? 'loading' : 'ready'}</span>
      <span>{isAuthenticated ? 'authenticated' : 'anonymous'}</span>
    </div>
  )
}

// S3：token 改由 httpOnly Cookie 承载，前端不再持有/解码 token；
// 会话初始化改为通过 /auth/profile 探测（Cookie 自动携带），失败则用 refresh Cookie 续期重试。
describe('AuthProvider 会话初始化（Cookie 模式）', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockReset()
    profileMock.mockReset()
    refreshMock.mockReset()
    mockPathname = '/dashboard'
  })

  it('初始化时通过 /auth/profile 探测恢复会话（Cookie 自动携带，无需前端持有 token）', async () => {
    profileMock.mockResolvedValue(mockUser)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument()
    })

    expect(profileMock).toHaveBeenCalled()
    // profile 成功则无需刷新
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('profile 失败时用 refresh Cookie 刷新后重试一次', async () => {
    profileMock.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce(mockUser)
    refreshMock.mockResolvedValue({ access_token: 'x', refresh_token: 'y' })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument()
    })

    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(profileMock).toHaveBeenCalledTimes(2)
  })

  it('公开页不应触发认证探测，避免未登录访客连收两个 401', async () => {
    mockPathname = '/'

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    // 不探测也必须结束 loading，否则消费 isLoading 的组件会一直停在加载态
    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })

    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(profileMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('/login 不属于公开页，仍应探测，否则 withGuest 无法把已登录用户送回 dashboard', async () => {
    mockPathname = '/login'
    profileMock.mockResolvedValue(mockUser)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument()
    })

    expect(profileMock).toHaveBeenCalled()
  })

  it('离开公开页后应补上探测（客户端导航不会重挂 Provider）', async () => {
    mockPathname = '/'
    profileMock.mockResolvedValue(mockUser)

    const { rerender } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })
    expect(profileMock).not.toHaveBeenCalled()

    // 模拟客户端导航：pathname 变化，Provider 未卸载
    mockPathname = '/login'
    rerender(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument()
    })
    expect(profileMock).toHaveBeenCalledTimes(1)
  })
})
