import React from 'react'
import {
  useDashboardData,
  useDashboardConfig,
  useDashboardAutoRefresh,
  useAlertAnalysis
} from '../hooks/useDashboard'
import { useSidebar } from '@/lib/contexts/sidebar-context'
import { Sidebar } from './Sidebar'
import { DashboardHeader } from './DashboardHeader'
import { StatsGrid } from './StatsGrid'
import { RecentAlertsCard } from './RecentAlertsCard'
import { QuickActionsCard } from './QuickActionsCard'
import { NetworkOverviewCard } from './NetworkOverviewCard'

export const DashboardView: React.FC = () => {
  const { data, loading, error, refreshStats, loadData } = useDashboardData()
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const { config } = useDashboardConfig() // 仅用于自动刷新配置

  // 分析告警数据
  const alertAnalysis = useAlertAnalysis(data?.recentAlerts || [])

  // 检查是否为权限受限状态（所有stats值都是'-'表示权限问题）
  const isPermissionLimited = data && data.stats.every(stat => stat.value === '-')

  // 自动刷新
  useDashboardAutoRefresh(
    refreshStats,
    config.autoRefresh,
    config.refreshInterval
  )

  const handleActionComplete = (actionType: string) => {
    console.log(`操作完成: ${actionType}`)
    // 可以在这里添加成功提示或刷新数据
    if (actionType === 'deviceScan') {
      refreshStats()
    }
  }

  const handleRetry = () => {
    loadData()
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white rounded-lg shadow-lg p-8">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">无法加载数据</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
            >
              {loading ? '重试中...' : '重试'}
            </button>
            <p className="text-sm text-gray-500">
              如果问题持续存在，请联系系统管理员
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        currentPath="/dashboard"
      />

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Header */}
        <DashboardHeader
          alertCount={alertAnalysis.high}
        />

        {/* Permission Limited Banner */}
        {isPermissionLimited && (
          <div className="mx-6 mt-4 mb-0">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">数据访问受限</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    由于权限限制，无法获取完整的监控数据。如需完整访问权限，请联系系统管理员。
                  </p>
                  <div className="mt-3">
                    <button
                      onClick={handleRetry}
                      disabled={loading}
                      className="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded-md transition-colors duration-200 disabled:opacity-50"
                    >
                      {loading ? '重试中...' : '重新尝试'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="p-6">
          {/* Stats Grid */}
          <div className="mb-8">
            <StatsGrid 
              stats={data?.stats || []} 
              loading={loading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Recent Alerts */}
            <RecentAlertsCard 
              alerts={data?.recentAlerts || []} 
              loading={loading}
            />

            {/* Quick Actions */}
            <QuickActionsCard 
              onActionComplete={handleActionComplete}
            />
          </div>

          {/* Network Overview */}
          <NetworkOverviewCard 
            overview={data?.networkOverview || []} 
            loading={loading}
          />

          {/* Loading overlay for refresh */}
          {loading && data && (
            <div className="fixed top-4 right-4 bg-white rounded-lg shadow-lg p-3 z-50">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-600">刷新数据中...</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}