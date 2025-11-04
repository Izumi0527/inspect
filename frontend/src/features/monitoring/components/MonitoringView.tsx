import React from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { Button } from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import { 
  useMonitoringData, 
  useMonitoringConfig, 
  useAutoRefresh, 
  useMonitoringExport 
} from '../hooks/useMonitoring'
import { NetworkStatsGrid } from './NetworkStatsGrid'
import { DeviceStatusMonitor } from './DeviceStatusMonitor'
import { NetworkTrafficCard } from './NetworkTrafficCard'
import { AlertSummaryCard } from './AlertSummaryCard'

export const MonitoringView: React.FC = () => {
  const { data, loading, error, refreshNetworkStats } = useMonitoringData()
  const { config, toggleAutoRefresh } = useMonitoringConfig()
  const { exporting, exportReport } = useMonitoringExport()

  // 自动刷新
  useAutoRefresh(refreshNetworkStats, config.autoRefresh, config.refreshInterval)

  const handleViewAlertDetails = () => {
    console.log('查看告警详情')
    // TODO: 导航到告警页面
  }

  if (error) {
    return (
      <AppLayout title="实时监控 - 错误">
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">加载监控数据时出现错误</div>
          <p className="text-gray-500">{error}</p>
        </div>
      </AppLayout>
    )
  }

  if (loading || !data) {
    return (
      <AppLayout title="实时监控">
        <div className="text-center py-12">
          <div className="text-gray-600">正在加载监控数据...</div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="实时监控" alertCount={data.totalAlerts || 0}>
      <div className="w-full px-6">
        {/* 功能工具栏 */}
        <div className="flex items-center justify-end gap-4 mb-8">
          <div className="text-sm text-gray-500">
            最后更新: {new Date(data.lastUpdate).toLocaleTimeString()}
          </div>
          <Button
            variant="outline"
            onClick={toggleAutoRefresh}
            className={config.autoRefresh ? 'bg-green-50 text-green-700' : ''}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${config.autoRefresh ? 'animate-spin' : ''}`} />
            {config.autoRefresh ? '自动刷新' : '手动刷新'}
          </Button>
          <Button 
            onClick={exportReport}
            disabled={exporting}
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? '导出中...' : '导出报告'}
          </Button>
        </div>

        {/* Performance Metrics */}
        <div className="mb-8">
          <NetworkStatsGrid stats={data.networkStats} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device Status */}
          <div className="lg:col-span-2">
            <DeviceStatusMonitor devices={data.deviceStatus} />
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <NetworkTrafficCard traffic={data.networkTraffic} />
            <AlertSummaryCard 
              summary={data.alertSummary} 
              onViewDetails={handleViewAlertDetails}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}