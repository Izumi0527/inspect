'use client'

import { Monitor, RefreshCw } from 'lucide-react'
import { Button } from '@/components/atoms'
import { type UseMonitoringPageResult } from '../../hooks/useMonitoringPage'
import { ReportExportButton } from '../ReportExportButton'
import { EngineHealthPopover } from '../EngineHealthPopover'
import { DeviceFilterSelect } from './DeviceFilterSelect'
import { GroupFilterSelect } from './GroupFilterSelect'
import { MonitoringTimeRangeControl } from './MonitoringTimeRangeControl'

interface MonitoringHeaderActionsProps {
  page: UseMonitoringPageResult
}

/**
 * 监控页 DashboardHeader 右侧操作区
 * （时间范围控制、分组筛选+新建分组、设备筛选、采集引擎健康胶囊、值班投屏、导出按钮、刷新按钮）
 */
export function MonitoringHeaderActions({ page }: MonitoringHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 时间范围（快捷范围 + 自定义日期范围） */}
      <MonitoringTimeRangeControl
        timeRange={page.timeRange}
        onTimeRangeChange={page.setTimeRange}
      />

      {/* 全局设备分组筛选 + 新建分组 */}
      <GroupFilterSelect
        activeGroupId={page.activeGroupId ?? null}
        onChange={(gid) => page.setActiveGroupId?.(gid)}
        canCreate={page.canCreateDeviceGroup}
        canUpdate={page.canUpdateDeviceGroup}
        canDelete={page.canDeleteDeviceGroup}
      />

      {/* 设备筛选 */}
      <DeviceFilterSelect deviceIds={page.deviceIds} onChange={page.setDeviceIds} />

      {/* 采集引擎健康微状态浮层 */}
      <EngineHealthPopover
        onSelectHost={(deviceId) => page.setSelectedHostId?.(deviceId)}
      />

      {/* 值班投屏模式开关 */}
      <button
        type="button"
        onClick={() => page.setIsKioskMode?.(!(page.isKioskMode ?? false))}
        aria-label="值班投屏"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Monitor className="h-3.5 w-3.5 text-primary" />
        <span>值班投屏</span>
      </button>

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
