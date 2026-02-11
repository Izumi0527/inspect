import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout'
import {
  useAlerts,
  useAlertStats,
  useAlertFilters,
  useAlertSelection
} from '../hooks/useAlerts'
import { AlertStatsGrid } from './AlertStatsGrid'
import { AlertAction } from '../types'
import { AlertFiltersBar } from './AlertFiltersBar'
import { AlertList } from './AlertList'
import { AlertDetailModal } from './AlertDetailModal'
import { SkeletonCard, SkeletonList } from '@/components/atoms/skeleton'
import { AdvancedFilters, AdvancedFilterValues } from './AdvancedFilters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Download, CheckCheck, XCircle, RefreshCw, Bell, BellOff, ArrowUpDown } from 'lucide-react'
import { exportAlerts } from '../api/alerts.api'
import { useWebSocketEvent } from '@/lib/websocket'
import { WebSocketEvents } from '@/lib/websocket'

const AUTO_REFRESH_INTERVAL = 30000 // 30秒

export const AlertsView: React.FC = () => {
  const searchParams = useSearchParams()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>({})
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [sortBy, setSortBy] = useState<'timestamp' | 'severity' | 'status'>('timestamp')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { filters, updateFilter } = useAlertFilters()

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page: currentPage,
      pageSize,
      sortBy,
      sortOrder
    }

    if (filters.searchQuery || advancedFilters.search) {
      params.search = advancedFilters.search || filters.searchQuery
    }

    if (advancedFilters.severity && advancedFilters.severity.length > 0) {
      params.severity = advancedFilters.severity
    } else if (filters.severityFilter && filters.severityFilter !== 'all') {
      params.severity = [filters.severityFilter]
    }

    if (advancedFilters.status && advancedFilters.status.length > 0) {
      params.status = advancedFilters.status
    } else if (filters.statusFilter && filters.statusFilter !== 'all') {
      params.status = [filters.statusFilter]
    }

    if (advancedFilters.category && advancedFilters.category.length > 0) {
      params.category = advancedFilters.category
    }

    if (advancedFilters.dateRange) {
      if (advancedFilters.dateRange.start) params.startDate = advancedFilters.dateRange.start
      if (advancedFilters.dateRange.end) params.endDate = advancedFilters.dateRange.end
    }

    if (advancedFilters.deviceIds && advancedFilters.deviceIds.length > 0) {
      params.deviceIds = advancedFilters.deviceIds
    }

    return params
  }, [currentPage, pageSize, filters, advancedFilters, sortBy, sortOrder])

  const {
    alerts,
    loading,
    error,
    pagination,
    handleAcknowledgeAlert,
    handleResolveAlert,
    handleDeleteAlert,
    loadAlerts
  } = useAlerts(queryParams)

  const { stats, loading: statsLoading, loadStats } = useAlertStats()
  const {
    selectedAlerts,
    toggleAlert,
    selectAll,
    clearSelection,
    handleBulkAction
  } = useAlertSelection()

  const selectedAlert = useMemo(
    () => alerts.find(alert => alert.id === selectedAlertId) ?? null,
    [alerts, selectedAlertId]
  )

  // URL 参数中的告警 ID
  useEffect(() => {
    const alertId = searchParams.get('id')
    if (alertId) setSelectedAlertId(alertId)
  }, [searchParams])

  // 自动刷新
  const refreshAll = useCallback(async () => {
    await Promise.all([loadAlerts(), loadStats()])
    setLastRefreshed(new Date())
  }, [loadAlerts, loadStats])

  useEffect(() => {
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(refreshAll, AUTO_REFRESH_INTERVAL)
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [autoRefresh, refreshAll])

  // 手动刷新
  const handleManualRefresh = useCallback(async () => {
    await refreshAll()
  }, [refreshAll])

  // WebSocket 实时告警更新
  useWebSocketEvent(WebSocketEvents.NEW_ALERT, () => {
    refreshAll()
  })
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, () => {
    refreshAll()
  })
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, () => {
    refreshAll()
  })

  // 导出
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportAlerts(queryParams as any)
    } catch {
      // error already logged in exportAlerts
    } finally {
      setExporting(false)
    }
  }, [queryParams])

  // 批量操作
  const handleBulkActionClick = async (action: AlertAction) => {
    try {
      await handleBulkAction(action)
      await refreshAll()
    } catch (error) {
      console.error('批量操作失败:', error)
    }
  }

  const handlePageChange = (page: number) => setCurrentPage(page)
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleSortChange = (field: 'timestamp' | 'severity' | 'status') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  const handleAdvancedFilterChange = (newFilters: AdvancedFilterValues) => {
    setAdvancedFilters(newFilters)
    setCurrentPage(1)
  }

  const handleAdvancedFilterReset = () => {
    setAdvancedFilters({})
    setCurrentPage(1)
  }

  const handleCloseAlertDetail = () => setSelectedAlertId(null)

  // 格式化最后刷新时间
  const formatLastRefreshed = () => {
    return lastRefreshed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (error) {
    return (
      <AppLayout title="告警中心" alertCount={stats?.active ?? 0}>
        <div className="text-center py-12">
          <div className="text-red-600 dark:text-red-500 mb-4">加载告警数据时出现错误</div>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <Button variant="outline" onClick={handleManualRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重试
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="告警中心" alertCount={stats?.active ?? 0}>
      <div className="flex flex-col gap-4 h-full">
        {/* 统计卡片 */}
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ) : stats ? (
          <AlertStatsGrid stats={stats} />
        ) : null}

        {/* 主内容区 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <CardTitle>告警列表</CardTitle>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  最后刷新: {formatLastRefreshed()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* 自动刷新开关 */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  title={autoRefresh ? '关闭自动刷新' : '开启自动刷新'}
                >
                  {autoRefresh ? (
                    <Bell className="h-4 w-4 text-green-500" />
                  ) : (
                    <BellOff className="h-4 w-4 text-gray-400" />
                  )}
                </Button>

                {/* 手动刷新 */}
                <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>

                {/* 导出 */}
                <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? '导出中...' : '导出'}
                </Button>

                {/* 排序 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      排序
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleSortChange('timestamp')}>
                      按时间 {sortBy === 'timestamp' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSortChange('severity')}>
                      按严重级别 {sortBy === 'severity' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSortChange('status')}>
                      按状态 {sortBy === 'status' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 批量操作 */}
                {selectedAlerts.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        批量操作 ({selectedAlerts.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleBulkActionClick('acknowledge')}>
                        <CheckCheck className="h-4 w-4 mr-2" />
                        批量确认
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkActionClick('resolve')}>
                        <CheckCheck className="h-4 w-4 mr-2" />
                        批量解决
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleBulkActionClick('delete')}
                        className="text-red-600"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        批量删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col overflow-hidden pt-0">
            <AlertFiltersBar
              filters={filters}
              onFilterChange={updateFilter}
              selectedCount={selectedAlerts.length}
              onBulkAction={handleBulkActionClick}
              renderAsCard={false}
            />

            <AdvancedFilters
              onFilterChange={handleAdvancedFilterChange}
              onReset={handleAdvancedFilterReset}
              renderAsCard={false}
            />

            <div className="overflow-y-auto flex-1">
              {loading ? (
                <SkeletonList count={pageSize} itemHeight="h-24" spacing="space-y-3" />
              ) : (
                <AlertList
                  alerts={alerts}
                  selectedAlerts={selectedAlerts}
                  onSelectAlert={toggleAlert}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onAcknowledge={handleAcknowledgeAlert}
                  onResolve={handleResolveAlert}
                  onDelete={handleDeleteAlert}
                  pagination={{
                    current: pagination.page,
                    total: pagination.total,
                    pageSize: pagination.pageSize,
                    onPageChange: handlePageChange,
                    onPageSizeChange: handlePageSizeChange
                  }}
                  renderAsCard={false}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedAlertId && (
        <AlertDetailModal
          open={!!selectedAlertId}
          alert={selectedAlert}
          onClose={handleCloseAlertDetail}
          onAcknowledge={handleAcknowledgeAlert}
          onResolve={handleResolveAlert}
          onDelete={handleDeleteAlert}
        />
      )}
    </AppLayout>
  )
}
