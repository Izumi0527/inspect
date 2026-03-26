'use client'

import { Badge, Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/atoms'
import { RefreshCw } from 'lucide-react'
import { TIME_RANGE_OPTIONS } from '../../utils/monitoring'
import { type UseMonitoringPageResult } from '../../hooks/useMonitoringPage'
import { ReportExportButton } from '../ReportExportButton'

interface MonitoringHeaderActionsProps {
  page: UseMonitoringPageResult
}

/**
 * 监控页 DashboardHeader 右侧操作区
 * （WS 状态 Badge、更新时间 Badge、时间范围选择器、导出按钮、刷新按钮）
 */
export function MonitoringHeaderActions({ page }: MonitoringHeaderActionsProps) {
  return (
    <div className="flex gap-2">
      <Badge variant={page.wsHealth === 'connected' ? 'success' : 'warning'} size="sm" className="hidden md:inline-flex">
        {page.wsHealth === 'connected' ? '实时连接' : page.wsHealth === 'stale' ? '连接不活跃' : '离线轮询'}
      </Badge>
      {page.lastUpdateLabel && (
        <Badge variant={page.isDataStale ? 'warning' : 'outline'} size="sm" className="hidden md:inline-flex">
          更新: {page.lastUpdateLabel}
          {page.isDataStale && page.dataAgeLabel ? `（已${page.dataAgeLabel}未更新）` : ''}
        </Badge>
      )}
      <Select value={page.timeRange} onValueChange={page.setTimeRange}>
        <SelectTrigger className="h-9 w-28 px-3 py-2 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {page.canExportReport && (
        <ReportExportButton
          timeRange={page.timeRange}
          sections={page.realtimeAlertsPermissionLimited ? ['stats', 'charts'] : ['stats', 'charts', 'alerts']}
        />
      )}
      <Button variant="outline" onClick={() => page.refetch()} disabled={page.isRefetching} className="cursor-pointer">
        <RefreshCw className={`w-4 h-4 mr-2 ${page.isRefetching ? 'animate-spin' : ''}`} />
        {page.isRefetching ? '刷新中...' : '刷新'}
      </Button>
    </div>
  )
}
