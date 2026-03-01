import { lazy, Suspense } from 'react'
import { motion } from 'framer-motion'

// 懒加载路由组件
export const LazyDashboardOverview = lazy(() => 
  import('@/features/dashboard/components/DashboardView').then(module => ({
    default: module.DashboardView
  }))
)

export const LazyDeviceManagement = lazy(() => 
  import('@/features/devices/components/DeviceManagementView').then(module => ({
    default: module.DeviceManagementView
  }))
)

export const LazyInspectionManagement = lazy(() =>
  import('@/features/inspection/components/InspectionView').then(module => ({
    default: module.InspectionView
  }))
)

export const LazyMonitoringView = lazy(() =>
  import('@/features/monitoring/components/MonitoringView').then(module => ({
    default: module.MonitoringView
  }))
)

export const LazyAlertCenter = lazy(() =>
  import('@/features/alerts/components/AlertsView').then(module => ({
    default: module.AlertsView
  }))
)

export const LazyLogCenter = lazy(() =>
  import('@/features/logs/components/LogsView').then(module => ({
    default: module.LogsView
  }))
)

export const LazyReportAnalysis = lazy(() =>
  import('@/features/reports/components/ReportsView').then(module => ({
    default: module.ReportsView
  }))
)

export const LazySystemSettings = lazy(() =>
  import('@/features/settings/components/SettingsView').then(module => ({
    default: module.SettingsView
  }))
)

// 统一的Loading组件
export const PageLoadingSkeleton = () => (
  <div className="min-h-screen bg-muted/40 p-6">
    <motion.div 
      className="animate-pulse"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 页面标题骨架 */}
      <div className="mb-8">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
      
      {/* 卡片网格骨架 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg p-6 shadow-sm">
            <div className="h-4 bg-gray-200 rounded mb-4"></div>
            <div className="h-8 bg-gray-200 rounded mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        ))}
      </div>
      
      {/* 内容区域骨架 */}
      <div className="bg-card rounded-lg p-6 shadow-sm">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="h-12 w-12 bg-gray-200 rounded"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
              <div className="h-8 w-20 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  </div>
)

// 高阶组件：带错误边界的懒加载包装器
interface LazyWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const LazyWrapper: React.FC<LazyWrapperProps> = ({ 
  children, 
  fallback = <PageLoadingSkeleton /> 
}) => (
  <Suspense fallback={fallback}>
    {children}
  </Suspense>
)
