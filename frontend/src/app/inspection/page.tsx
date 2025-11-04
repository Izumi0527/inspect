'use client'

import { LazyInspectionManagement, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { useRequireAuth } from '@/lib/contexts/auth-context'

export default function InspectionPage() {
  // 确保用户已登录，否则重定向到登录页
  const { isAuthenticated, isLoading } = useRequireAuth()

  // 正在检查认证状态时显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">验证登录状态...</p>
        </div>
      </div>
    )
  }

  // 如果未认证，将由useRequireAuth自动重定向到登录页
  if (!isAuthenticated) {
    return null
  }

  return (
    <ErrorBoundary>
      <LazyWrapper>
        <LazyInspectionManagement />
      </LazyWrapper>
    </ErrorBoundary>
  )
}