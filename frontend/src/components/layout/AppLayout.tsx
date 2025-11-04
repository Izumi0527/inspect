'use client'

import React, { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/features/dashboard/components/Sidebar'
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader'
import { useDashboardConfig } from '@/features/dashboard/hooks/useDashboard'
import { AnimatedContainer } from '@/components/animation/AnimationSystem'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'

interface AppLayoutProps {
  children: ReactNode
  title?: string
  alertCount?: number
  fullWidth?: boolean // 新增：是否全宽显示
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title = "巡检系统",
  alertCount = 0,
  fullWidth = false
}) => {
  const pathname = usePathname()
  const { config, toggleSidebar } = useDashboardConfig()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        isOpen={config.sidebarOpen}
        onToggle={toggleSidebar}
        currentPath={pathname}
      />

      {/* Main Content */}
      <div className={`${config.sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Header */}
        <DashboardHeader
          alertCount={alertCount}
          title={title}
        />

        {/* Page Content */}
        <ErrorBoundary>
          <AnimatedContainer
            animation="pageTransition"
            className={fullWidth ? "p-2" : "p-6"}
          >
            {children}
          </AnimatedContainer>
        </ErrorBoundary>
      </div>
    </div>
  )
}

// Hook for using AppLayout with alert data
export const useAppLayout = () => {
  const { config, toggleSidebar } = useDashboardConfig()
  
  return {
    sidebarOpen: config.sidebarOpen,
    toggleSidebar
  }
}