'use client'

import { LazySystemSettings, LazyWrapper } from '@/components/lazy/LazyComponents'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { useRequireAuth } from '@/lib/contexts/auth-context'

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useRequireAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground text-lg">验证登录状态...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <ErrorBoundary>
      <LazyWrapper>
        <LazySystemSettings />
      </LazyWrapper>
    </ErrorBoundary>
  )
}
