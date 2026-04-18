import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/lib/contexts/auth-context'
import { api, TokenManager } from '@/lib/api-client'
import { Permission, UserRole, type User } from '@/lib/types/auth.types'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
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

const buildJwt = (expOffsetSeconds: number) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      sub: 'admin',
      exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
    })
  )
  return `${header}.${payload}.signature`
}

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

describe('AuthProvider 近过期 token 自动续期', () => {
  beforeEach(() => {
    localStorage.clear()
    mockPush.mockReset()
    profileMock.mockReset()
    refreshMock.mockReset()
    profileMock.mockResolvedValue(mockUser)
    refreshMock.mockResolvedValue({
      access_token: buildJwt(1800),
      refresh_token: buildJwt(7 * 24 * 60 * 60),
      token_type: 'bearer',
      expires_in: 1800,
    })
  })

  it('初始化时若 access token 剩余不足 5 分钟，也应立即刷新', async () => {
    TokenManager.setTokens(buildJwt(120), buildJwt(7 * 24 * 60 * 60))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
  })
})
