'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { useRequireAuth } from '@/lib/contexts/auth-context'
import { SettingsTabs } from '@/features/settings/components/shared/SettingsTabs'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useSidebar()
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
    <div className="min-h-screen bg-gray-50">
      {/* 左侧主菜单侧栏 */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath={pathname}
      />

      {/* 主内容区 - 动态左边距适配侧栏状态 */}
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* 页面标题和Tab导航 */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-6">
              <h1 className="text-3xl font-bold text-gray-900">系统管理</h1>
              <p className="mt-2 text-sm text-gray-600">
                管理系统配置、用户权限、安全策略和数据备份
              </p>
            </div>

            {/* Tab 导航 */}
            <SettingsTabs />
          </div>
        </div>

        {/* 主内容区 */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense fallback={<LoadingSkeleton />}>
            {children}
          </Suspense>
        </div>
      </div>
    </div>
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
