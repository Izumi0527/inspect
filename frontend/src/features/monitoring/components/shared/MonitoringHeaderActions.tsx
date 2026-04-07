'use client'

import { Badge, Button } from '@/components/atoms'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { TIME_RANGE_OPTIONS } from '../../utils/monitoring'
import { type UseMonitoringPageResult } from '../../hooks/useMonitoringPage'
import { ReportExportButton } from '../ReportExportButton'

interface MonitoringHeaderActionsProps {
  page: UseMonitoringPageResult
}

// WS 状态配置
const WS_STATUS = {
  connected:    { icon: Wifi,    label: '已连接',   variant: 'success' as const },
  stale:        { icon: WifiOff, label: '连接不稳', variant: 'warning' as const },
  disconnected: { icon: WifiOff, label: '已断开',   variant: 'warning' as const },
} as const

/**
 * 监控页 DashboardHeader 右侧操作区
 * （WS 状态 Badge、数据新鲜度 Badge、时间范围选择器、导出按钮、刷新按钮）
 */
export function MonitoringHeaderActions({ page }: MonitoringHeaderActionsProps) {
  const wsStatus = WS_STATUS[page.wsHealth]
  const WsIcon = wsStatus.icon

  // 数据新鲜度 Badge 的显示逻辑
  const freshnessBadge = (() => {
    if (!page.lastUpdateLabel) return null

    if (!page.isDataStale) {
      return (
        <Badge variant="outline" size="sm" className="hidden md:inline-flex gap-1">
          <CheckCircle2 className="h-3 w-3" />
          数据已更新
        </Badge>
      )
    }

    // 数据过期：区分 "API 正常但无新数据" vs "可能离线"
    if (page.apiOkButDataStale) {
      return (
        <Badge variant="warning" size="sm" className="hidden md:inline-flex gap-1" title={`最新数据: ${page.lastUpdateLabel}\n后端服务正常响应，但设备指标采集可能失败（设备不可达/SNMP 超时）`}>
          <Clock className="h-3 w-3" />
          {page.dataAgeLabel}无新数据
        </Badge>
      )
    }

    return (
      <Badge variant="warning" size="sm" className="hidden md:inline-flex gap-1" title={`最新数据: ${page.lastUpdateLabel}`}>
        <AlertTriangle className="h-3 w-3" />
        已{page.dataAgeLabel}未更新
      </Badge>
    )
  })()

  return (
    <div className="flex gap-2">
      {/* WS 连接状态 */}
      <Badge variant={wsStatus.variant} size="sm" className="hidden md:inline-flex gap-1">
        <WsIcon className="h-3 w-3" />
        {wsStatus.label}
      </Badge>

      {/* 数据新鲜度 */}
      {freshnessBadge}

      {/* 时间范围选择器 */}
      <Select value={page.timeRange} onValueChange={page.setTimeRange}>
        <SelectTrigger className="h-9 w-28 px-3 py-2 text-sm" aria-label="监控时间范围">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 导出按钮 */}
      {page.canExportReport && (
        <ReportExportButton
          timeRange={page.timeRange}
          sections={page.realtimeAlertsPermissionLimited ? ['stats', 'charts'] : ['stats', 'charts', 'alerts']}
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
