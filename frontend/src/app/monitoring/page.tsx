'use client'

import {
  LazyMonitoringViewV2,
  LazyWrapper,
} from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { useRequireAuth } from '@/lib/contexts/auth-context'

/**
 * 监控页面
 *
 * @features
 * - 使用监控中心 v2 UI
 * - 开发环境认证绕过（设置环境变量 NEXT_PUBLIC_DISABLE_AUTH_CHECK=true）
 */

export default function MonitoringPage() {
  // ==================== 开发环境认证绕过 ====================
  // 仅在开发环境启用，生产环境必须认证
  const DISABLE_AUTH_CHECK = process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === 'true'

  // ← 传递 skipRedirect 参数，控制是否跳过自动跳转
  const { isAuthenticated, isLoading } = useRequireAuth({
    skipRedirect: DISABLE_AUTH_CHECK
  })

  // 开发环境跳过认证检查
  if (DISABLE_AUTH_CHECK) {
    return (
      <div>
        {/* 开发环境警告横幅 */}
        <div className="bg-yellow-100 border-b-2 border-yellow-400 px-4 py-2 text-center text-sm font-medium text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
          ⚠️ 开发模式：已禁用认证检查 (NEXT_PUBLIC_DISABLE_AUTH_CHECK=true)
        </div>

        <ErrorBoundary>
          <LazyWrapper>
            <LazyMonitoringViewV2 />
          </LazyWrapper>
        </ErrorBoundary>
      </div>
    )
  }

  // ==================== 生产环境认证检查 ====================
  // 正在检查认证状态时显示加载状态
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="text-gray-600">验证登录状态...</p>
        </div>
      </div>
    )
  }

  // 如果未认证,将由useRequireAuth自动重定向到登录页
  if (!isAuthenticated) {
    return null
  }

  return (
    <ErrorBoundary>
      <LazyWrapper>
        <LazyMonitoringViewV2 />
      </LazyWrapper>
    </ErrorBoundary>
  )
}