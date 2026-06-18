import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/lib/contexts/auth-context'
import { api } from '@/lib/api-client'
import { Permission, UserRole, type User } from '@/lib/types/auth.types'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
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
})
