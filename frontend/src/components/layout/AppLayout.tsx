'use client'

import React, { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { AnimatedContainer } from '@/components/animation/AnimationSystem'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { Card, CardHeader, CardContent } from '@/components/atoms'

// 路由驱动的Tab配置接口
export interface RouterTab {
  name: string
  href: string
  icon: LucideIcon
}

interface AppLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  alertCount?: number
  fullWidth?: boolean // 是否全宽显示
  routerTabs?: RouterTab[] // 路由驱动的Tab配置
  hideHeader?: boolean // 是否隐藏默认Header
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title = "巡检系统",
  subtitle,
  alertCount = 0,
  fullWidth = false,
  routerTabs,
  hideHeader = false
}) => {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useSidebar()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath={pathname}
      />

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Header - 显示标题、搜索和通知 */}
        {!hideHeader && (
          <DashboardHeader
            alertCount={alertCount}
            title={title}
            subtitle={subtitle}
          />
        )}

        {/* Page Content */}
        <ErrorBoundary>
          <AnimatedContainer
            animation="pageTransition"
            className={fullWidth ? "p-1" : "p-4"}
          >
            {routerTabs ? (
              /* Router Tabs Mode - Tab和内容包装在Card中 */
              <Card className="overflow-hidden">
                <CardHeader className="pb-0">
                  {/* Tab导航 */}
                  <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden">
                    <nav className="-mb-px flex space-x-8 min-w-max">
                      {routerTabs.map((tab) => {
                        const Icon = tab.icon
                        const isActive = pathname.startsWith(tab.href)

                        return (
                          <Link
                            key={tab.name}
                            href={tab.href}
                            className={`
                              flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors whitespace-nowrap
                              ${isActive
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                              }
                            `}
                          >
                            <Icon className="w-5 h-5" />
                            {tab.name}
                          </Link>
                        )
                      })}
                    </nav>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 px-0">
                  {children}
                </CardContent>
              </Card>
            ) : (
              /* Normal Mode - 直接渲染children */
              children
            )}
          </AnimatedContainer>
        </ErrorBoundary>
      </div>
    </div>
  )
}

// Hook for using AppLayout with alert data
export const useAppLayout = () => {
  const { sidebarOpen, toggleSidebar } = useSidebar()

  return {
    sidebarOpen,
    toggleSidebar
  }
}