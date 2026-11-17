'use client'

import { Button } from '@/components/atoms'
import { RefreshCw } from 'lucide-react'
import { type UseMonitoringPageResult } from '../../hooks/useMonitoringPage'
import { ReportExportButton } from '../ReportExportButton'
import { DeviceFilterSelect } from './DeviceFilterSelect'
import { MonitoringTimeRangeControl } from './MonitoringTimeRangeControl'

interface MonitoringHeaderActionsProps {
  page: UseMonitoringPageResult
}

/**
 * 监控页 DashboardHeader 右侧操作区
 * （时间范围控制、设备筛选、导出按钮、刷新按钮）
 */
export function MonitoringHeaderActions({ page }: MonitoringHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* 时间范围（快捷范围 + 自定义日期范围） */}
      <MonitoringTimeRangeControl
        timeRange={page.timeRange}
        onTimeRangeChange={page.setTimeRange}
      />

      {/* 设备筛选 */}
      <DeviceFilterSelect deviceIds={page.deviceIds} onChange={page.setDeviceIds} />

      {/* 导出按钮 */}
      {page.canExportReport && (
        <ReportExportButton
          timeRange={page.timeRange}
          sections={page.canReadAlerts ? ['stats', 'charts', 'alerts'] : ['stats', 'charts']}
        />
      )}

      {/* 刷新按钮 */}
      <Button variant="outline" onClick={() => page.refetch()} disabled={page.isRefetching}>
        <RefreshCw className={`w-4 h-4 mr-2 ${page.isRefetching ? 'animate-spin' : ''}`} />
        {page.isRefetching ? '刷新中...' : '刷新'}
      </Button>
    </div>
  )
}
