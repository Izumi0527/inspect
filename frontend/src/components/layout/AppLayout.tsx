'use client'

import React, { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'
import { Sidebar } from '@/features/dashboard/components/layout/Sidebar'
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
  actions?: ReactNode // 顶栏右侧自定义操作区
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title = "巡检系统",
  subtitle,
  alertCount = 0,
  fullWidth = false,
  routerTabs,
  hideHeader = false,
  actions
}) => {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useSidebar()

  return (
    <div data-slot="app-layout" className="h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath={pathname}
      />

      {/* Main Content */}
      <div
        data-slot="app-main"
        data-collapsed={sidebarOpen ? undefined : 'true'}
        className={`${sidebarOpen ? 'ml-60' : 'ml-14'} transition-all duration-200 motion-reduce:transition-none h-full flex flex-col`}
      >
        {/* Header - 显示标题、搜索和通知 */}
        {!hideHeader && (
          <DashboardHeader
            alertCount={alertCount}
            title={title}
            subtitle={subtitle}
            actions={actions}
          />
        )}

        {/* Page Content */}
        <ErrorBoundary>
          <AnimatedContainer
            animation="pageTransition"
            className={`flex-1 overflow-auto ${fullWidth ? "p-1" : "p-4 lg:p-6"}`}
          >
            {routerTabs ? (
              /* Router Tabs Mode - Tab和内容包装在Card中 */
              <Card className="overflow-hidden">
                <CardHeader className="pb-0">
                  {/* Tab导航 */}
                  <div className="border-b border-border overflow-x-auto overflow-y-hidden">
                    <nav className="-mb-px flex space-x-8 min-w-max">
                      {routerTabs.map((tab) => {
                        const Icon = tab.icon
                        const isActive = pathname.startsWith(tab.href)

                        return (
                          <Link
                            key={tab.name}
                            href={tab.href}
                            className={`
                              flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap
                              ${isActive
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                              }
                            `}
                          >
                            <Icon className="w-4 h-4" />
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
