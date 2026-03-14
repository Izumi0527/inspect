import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { RouteGuard } from '@/lib/components/route-guard'
import { Permission } from '@/lib/types/auth.types'

const push = jest.fn()
const back = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    back,
  }),
  usePathname: () => '/monitoring',
}))

let mockAuth: {
  isAuthenticated: boolean
  isLoading: boolean
  user: unknown
  checkPermission: (permission: Permission) => boolean
  checkRole: (roles: unknown) => boolean
}

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => mockAuth,
}))

describe('RouteGuard', () => {
  beforeEach(() => {
    push.mockClear()
    back.mockClear()

    mockAuth = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      checkPermission: () => false,
      checkRole: () => false,
    }
  })

  it('加载中应展示加载态', () => {
    mockAuth = {
      ...mockAuth,
      isLoading: true,
    }

    render(
      <RouteGuard requireAuth>
        <div>content</div>
      </RouteGuard>
    )

    expect(screen.getByText('正在验证身份...')).toBeInTheDocument()
  })

  it('未登录时应跳转到登录页并携带 redirect 参数', async () => {
    mockAuth = {
      ...mockAuth,
      isAuthenticated: false,
      isLoading: false,
    }

    render(
      <RouteGuard requireAuth>
        <div>content</div>
      </RouteGuard>
    )

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/login?redirect=%2Fmonitoring')
    })
  })

  it('已登录但缺少权限时应展示明确的权限提示', async () => {
    mockAuth = {
      ...mockAuth,
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1' },
      checkPermission: () => false,
      checkRole: () => true,
    }

    render(
      <RouteGuard requireAuth requiredPermissions={[Permission.MONITORING_READ]}>
        <div>content</div>
      </RouteGuard>
    )

    await waitFor(() => {
      expect(screen.getByText('访问被拒绝')).toBeInTheDocument()
    })

    expect(screen.getByText('当前账号缺少访问该页面所需权限')).toBeInTheDocument()
    expect(screen.getByText('monitoring:read')).toBeInTheDocument()
  })

  it('已登录且权限满足时应渲染子组件', async () => {
    mockAuth = {
      ...mockAuth,
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1' },
      checkPermission: (permission: Permission) => permission === Permission.MONITORING_READ,
      checkRole: () => true,
    }

    render(
      <RouteGuard requireAuth requiredPermissions={[Permission.MONITORING_READ]}>
        <div>content</div>
      </RouteGuard>
    )

    await waitFor(() => {
      expect(screen.getByText('content')).toBeInTheDocument()
    })
  })
})

