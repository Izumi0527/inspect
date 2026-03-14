import React from 'react'
import { render, screen } from '@testing-library/react'
import MonitoringPage from '@/app/monitoring/page'

jest.mock('@/components/lazy/LazyComponents', () => ({
  LazyWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LazyMonitoringView: () => <div>monitoring-view</div>,
}))

jest.mock('@/components/error/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/components/route-guard', () => ({
  RouteGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="route-guard">{children}</div>
  ),
}))

describe('MonitoringPage 鉴权绕过开关', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalDisableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK = originalDisableAuth
  })

  it('仅在开发环境且开关启用时允许绕过 RouteGuard', () => {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK = 'true'

    render(<MonitoringPage />)

    expect(
      screen.getByText('⚠️ 开发模式：已禁用认证检查 (NEXT_PUBLIC_DISABLE_AUTH_CHECK=true)')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('route-guard')).not.toBeInTheDocument()
    expect(screen.getByText('monitoring-view')).toBeInTheDocument()
  })

  it('生产/测试环境即使开关启用也必须走 RouteGuard', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK = 'true'

    render(<MonitoringPage />)

    expect(screen.queryByText(/已禁用认证检查/)).not.toBeInTheDocument()
    expect(screen.getByTestId('route-guard')).toBeInTheDocument()
  })
})

