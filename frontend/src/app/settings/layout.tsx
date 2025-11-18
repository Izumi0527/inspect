'use client'

import { Suspense } from 'react'
import { useRequireAuth } from '@/lib/contexts/auth-context'
import { AppLayout } from '@/components/layout/AppLayout'
import { settingsTabs } from '@/features/settings/components/shared/SettingsTabs'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useRequireAuth()

  // 验证登录状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">验证登录状态...</p>
        </div>
      </div>
    )
  }

  // 未认证则自动跳转到登录页
  if (!isAuthenticated) {
    return null
  }

  return (
    <AppLayout
      title="系统管理"
      routerTabs={settingsTabs}
    >
      <Suspense fallback={<LoadingSkeleton />}>
        {children}
      </Suspense>
    </AppLayout>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
