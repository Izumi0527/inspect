import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { formatTimeHMS } from '@/utils/formatters'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout'
import {
  useAlerts,
  useAlertStats,
  useAlertFilters,
  useAlertSelection
} from '../hooks/useAlerts'
import { AlertStatsGrid } from './AlertStatsGrid'
import { AlertAction, AlertQueryParams } from '../types'
import { AlertFiltersBar } from './AlertFiltersBar'
import { AlertList } from './AlertList'
import { AlertDetailModal } from './AlertDetailModal'
import { SkeletonCard, SkeletonList } from '@/components/atoms/skeleton'
import { AdvancedFilters, AdvancedFilterValues, ALERT_ADVANCED_FILTERS_STORAGE_KEY } from './AdvancedFilters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Download, CheckCheck, XCircle, RefreshCw, Bell, BellOff, ArrowUpDown, AlertTriangle } from 'lucide-react'
import { exportAlerts } from '../api/alerts.api'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useWebSocket, useWebSocketEvent, WebSocketEvents } from '@/lib/websocket'
import { ErrorAlert } from '@/components/atoms/ErrorAlert'
import { CompactPageToolbar } from '@/components/shared'

const AUTO_REFRESH_INTERVAL = 30000 // 30秒
const WS_SELF_EVENT_TTL_MS = 5000 // 本端操作后短时间内忽略同ID回推事件，避免重复刷新

const parseDateOnly = (value: string): { year: number; month: number; day: number } | null => {
  const raw = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return { year, month, day }
}

const toLocalBoundaryIso = (dateOnly: string, endOfDay: boolean): string | null => {
  const parsed = parseDateOnly(dateOnly)
  if (!parsed) return null
  const { year, month, day } = parsed
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function AlertsAccessDenied() {
  return (
    <AppLayout title="告警中心 - 无权限" alertCount={0}>
      <div className="text-center py-12">
        <div className="mb-6">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            无权限访问告警中心
          </h3>
          <p className="text-muted-foreground mb-4">
            当前账号缺少查看告警的权限（{Permission.ALERTS_READ}），请联系管理员开通。
          </p>
          <div className="space-x-3">
            <Button onClick={() => window.history.back()} variant="outline">
              返回上一页
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

const AlertsViewContent: React.FC = () => {
  const searchParams = useSearchParams()
  const ws = useWebSocket()
  const canUpdateAlerts = usePermission(Permission.ALERTS_UPDATE)
  const canDeleteAlerts = usePermission(Permission.ALERTS_DELETE)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>({})
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [sortBy, setSortBy] = useState<'timestamp' | 'severity' | 'status'>('timestamp')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [realtimePendingCount, setRealtimePendingCount] = useState(0)
  const [realtimePendingAt, setRealtimePendingAt] = useState<Date | null>(null)
  const [pendingRefreshAfterQueryChange, setPendingRefreshAfterQueryChange] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsSelfEventRef = useRef<Map<string, number>>(new Map())

  const { filters, updateFilter, resetFilters } = useAlertFilters()

  const hasActiveFilters = useMemo(() => {
    const hasBasicSearch = String(filters.searchQuery ?? '').trim() !== ''
    const hasBasicSeverity = String(filters.severityFilter ?? '').trim() !== '' && filters.severityFilter !== 'all'
    const hasBasicStatus = String(filters.statusFilter ?? '').trim() !== '' && filters.statusFilter !== 'all'

    const adv = advancedFilters ?? {}
    const hasAdvSearch = String(adv.search ?? '').trim() !== ''
    const hasAdvSeverity = Array.isArray(adv.severity) && adv.severity.length > 0
    const hasAdvStatus = Array.isArray(adv.status) && adv.status.length > 0
    const hasAdvCategory = Array.isArray(adv.category) && adv.category.length > 0
    const hasAdvDeviceIds = Array.isArray(adv.deviceIds) && adv.deviceIds.length > 0
    const hasAdvDateRange = !!(String(adv.dateRange?.start ?? '').trim() || String(adv.dateRange?.end ?? '').trim())

    return (
      hasBasicSearch ||
      hasBasicSeverity ||
      hasBasicStatus ||
      hasAdvSearch ||
      hasAdvSeverity ||
      hasAdvStatus ||
      hasAdvCategory ||
      hasAdvDeviceIds ||
      hasAdvDateRange
    )
  }, [advancedFilters, filters.searchQuery, filters.severityFilter, filters.statusFilter])

  const queryParams = useMemo(() => {
    const params: AlertQueryParams = {
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
      if (
        filters.severityFilter === 'critical' ||
        filters.severityFilter === 'warning' ||
        filters.severityFilter === 'info'
      ) {
        params.severity = [filters.severityFilter]
      }
    }

    if (advancedFilters.status && advancedFilters.status.length > 0) {
      params.status = advancedFilters.status
    } else if (filters.statusFilter && filters.statusFilter !== 'all') {
      if (
        filters.statusFilter === 'active' ||
        filters.statusFilter === 'acknowledged' ||
        filters.statusFilter === 'resolved'
      ) {
        params.status = [filters.statusFilter]
      }
    }

    if (advancedFilters.category && advancedFilters.category.length > 0) {
      params.category = advancedFilters.category
    }

    if (advancedFilters.dateRange) {
      const startValue = String(advancedFilters.dateRange.start ?? '').trim()
      const endValue = String(advancedFilters.dateRange.end ?? '').trim()

      if (startValue) {
        const startIso = parseDateOnly(startValue) ? toLocalBoundaryIso(startValue, false) : startValue
        if (startIso) params.startDate = startIso
      }
      if (endValue) {
        const endIso = parseDateOnly(endValue) ? toLocalBoundaryIso(endValue, true) : endValue
        if (endIso) params.endDate = endIso
      }
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

  const { stats, loading: statsLoading, error: statsError, loadStats } = useAlertStats()
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

  const clearRealtimePending = useCallback(() => {
    setRealtimePendingCount(0)
    setRealtimePendingAt(null)
  }, [])

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
    clearRealtimePending()
    await refreshAll()
  }, [clearRealtimePending, refreshAll])

  const markSelfEvent = useCallback((id: string) => {
    const normalizedId = id.trim()
    if (!normalizedId) return
    wsSelfEventRef.current.set(normalizedId, Date.now() + WS_SELF_EVENT_TTL_MS)
  }, [])

  const shouldSkipSelfEventRefresh = useCallback((payload: unknown) => {
    const now = Date.now()
    wsSelfEventRef.current.forEach((expiresAt, key) => {
      if (expiresAt <= now) wsSelfEventRef.current.delete(key)
    })

    if (!payload || typeof payload !== 'object') return false
    const data = payload as Record<string, unknown>
    const candidates: unknown[] = [
      data.id,
      data.alert_id,
      data.alertId,
      (data.alert as Record<string, unknown> | undefined)?.id,
    ]
    const resolvedId = candidates.find((value) => typeof value === 'string' || typeof value === 'number')
    let id = ''
    if (typeof resolvedId === 'string') id = resolvedId.trim()
    if (typeof resolvedId === 'number' && Number.isFinite(resolvedId)) id = String(resolvedId)
    if (!id) return false

    const expiresAt = wsSelfEventRef.current.get(id)
    if (!expiresAt || expiresAt <= now) {
      wsSelfEventRef.current.delete(id)
      return false
    }
    wsSelfEventRef.current.delete(id)
    return true
  }, [])

  // WebSocket 房间订阅：告警推送已改为 `alerts` 房间，必须订阅才会收到推送。
  const subscribeAlertsRoom = useCallback(() => {
    if (!ws.isConnected()) return
    ws.subscribeToAlerts()
  }, [ws])

  useEffect(() => {
    subscribeAlertsRoom()

    return () => {
      if (!ws.isConnected()) return
      ws.unsubscribeFromAlerts()
    }
  }, [subscribeAlertsRoom, ws])

  const handleWsConnect = useCallback(() => {
    subscribeAlertsRoom()
  }, [subscribeAlertsRoom])
  useWebSocketEvent(WebSocketEvents.CONNECT, handleWsConnect)

  // WebSocket 实时告警更新
  const handleRealtimeAlertEvent = useCallback((payload: unknown) => {
    if (shouldSkipSelfEventRefresh(payload)) return

    // “筛选/分页/关闭自动刷新”场景下不自动刷新列表，避免破坏用户当前视图；改为提示条+手动应用。
    const shouldAutoApply = autoRefresh && !hasActiveFilters && currentPage === 1
    if (shouldAutoApply) {
      void refreshAll()
      return
    }

    setRealtimePendingCount((prev) => prev + 1)
    setRealtimePendingAt(new Date())
    void loadStats()
  }, [autoRefresh, currentPage, hasActiveFilters, loadStats, refreshAll, shouldSkipSelfEventRefresh])

  useWebSocketEvent(WebSocketEvents.NEW_ALERT, handleRealtimeAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_UPDATE, handleRealtimeAlertEvent)
  useWebSocketEvent(WebSocketEvents.ALERT_RESOLVED, handleRealtimeAlertEvent)

  const safeSetAdvancedFiltersStorage = useCallback((next: AdvancedFilterValues) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(ALERT_ADVANCED_FILTERS_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.warn('保存告警高级筛选本地缓存失败:', error)
    }
  }, [])

  const safeRemoveAdvancedFiltersStorage = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(ALERT_ADVANCED_FILTERS_STORAGE_KEY)
    } catch (error) {
      console.warn('清理告警高级筛选本地缓存失败:', error)
    }
  }, [])

  const resetAdvancedFilters = useCallback(() => {
    safeRemoveAdvancedFiltersStorage()
    setAdvancedFilters({})
  }, [safeRemoveAdvancedFiltersStorage])

  const clearAdvancedOverrides = useCallback((options: { clearSeverity?: boolean; clearStatus?: boolean }) => {
    const { clearSeverity, clearStatus } = options
    if (!clearSeverity && !clearStatus) return

    const hasSeverityOverride = clearSeverity && Array.isArray(advancedFilters.severity) && advancedFilters.severity.length > 0
    const hasStatusOverride = clearStatus && Array.isArray(advancedFilters.status) && advancedFilters.status.length > 0
    if (!hasSeverityOverride && !hasStatusOverride) return

    const next: AdvancedFilterValues = {
      ...advancedFilters,
      ...(clearSeverity ? { severity: undefined } : {}),
      ...(clearStatus ? { status: undefined } : {}),
    }

    setAdvancedFilters(next)
    safeSetAdvancedFiltersStorage(next)
  }, [advancedFilters, safeSetAdvancedFiltersStorage])

  const applyRealtimeUpdates = useCallback(async () => {
    clearRealtimePending()
    await refreshAll()
  }, [clearRealtimePending, refreshAll])

  const requestRefreshAfterQueryChange = useCallback(() => {
    setPendingRefreshAfterQueryChange(true)
  }, [])

  const handleClearFiltersAndView = useCallback(() => {
    clearRealtimePending()
    resetFilters()
    resetAdvancedFilters()
    setCurrentPage(1)
    requestRefreshAfterQueryChange()
  }, [clearRealtimePending, requestRefreshAfterQueryChange, resetAdvancedFilters, resetFilters])

  const handleGoToFirstPageAndView = useCallback(() => {
    clearRealtimePending()
    setCurrentPage(1)
    requestRefreshAfterQueryChange()
  }, [clearRealtimePending, requestRefreshAfterQueryChange])

  // 外部触发筛选变更后，等 queryParams 更新到位再执行一次 refreshAll，避免使用旧参数刷新。
  useEffect(() => {
    if (!pendingRefreshAfterQueryChange) return
    setPendingRefreshAfterQueryChange(false)
    void refreshAll()
  }, [pendingRefreshAfterQueryChange, refreshAll])

  // 导出
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportAlerts(queryParams)
    } catch {
      // error already logged in exportAlerts
    } finally {
      setExporting(false)
    }
  }, [queryParams])

  const handleAcknowledgeAndRefresh = useCallback(async (id: string, assignee?: string) => {
    markSelfEvent(id)
    await handleAcknowledgeAlert(id, assignee)
    await refreshAll()
  }, [markSelfEvent, handleAcknowledgeAlert, refreshAll])

  const handleResolveAndRefresh = useCallback(async (id: string, comment?: string) => {
    markSelfEvent(id)
    await handleResolveAlert(id, comment)
    await refreshAll()
  }, [markSelfEvent, handleResolveAlert, refreshAll])

  const handleDeleteAndRefresh = useCallback(async (id: string) => {
    markSelfEvent(id)
    await handleDeleteAlert(id)
    await refreshAll()
  }, [markSelfEvent, handleDeleteAlert, refreshAll])

  // 批量操作
  const handleBulkActionClick = async (action: AlertAction) => {
    try {
      if ((action === 'acknowledge' || action === 'resolve' || action === 'assign' || action === 'comment') && !canUpdateAlerts) {
        console.warn('缺少告警操作权限，已阻止批量操作:', action)
        return
      }
      if (action === 'delete' && !canDeleteAlerts) {
        console.warn('缺少告警删除权限，已阻止批量删除')
        return
      }
      if (action === 'delete') {
        const ok = confirm(`确定要删除选中的 ${selectedAlerts.length} 条告警吗？此操作不可恢复。`)
        if (!ok) return
      }
      selectedAlerts.forEach(markSelfEvent)
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

  const handleAdvancedFilterChange = useCallback((newFilters: AdvancedFilterValues) => {
    setAdvancedFilters(newFilters)
    setCurrentPage(1)
  }, [])

  const handleAdvancedFilterReset = useCallback(() => {
    resetAdvancedFilters()
    setCurrentPage(1)
  }, [resetAdvancedFilters])

  const applyStatFilter = useCallback((options: { severity?: 'all' | 'critical' | 'warning' | 'info'; status?: 'all' | 'active' | 'acknowledged' | 'resolved' }) => {
    clearRealtimePending()

    const { severity, status } = options
    if (severity) {
      updateFilter('severityFilter', severity)
    }
    if (status) {
      updateFilter('statusFilter', status)
    }

    // 当高级筛选中已设置 severity/status 时，会覆盖基础筛选；这里清理覆盖项，保证“点击统计卡”必然生效。
    clearAdvancedOverrides({ clearSeverity: !!severity, clearStatus: !!status })

    setCurrentPage(1)
  }, [clearAdvancedOverrides, clearRealtimePending, updateFilter])

  const handleStatCardClick = useCallback((card: 'total' | 'critical' | 'warning' | 'info' | 'active' | 'acknowledged' | 'resolved') => {
    switch (card) {
      case 'total':
        applyStatFilter({ severity: 'all', status: 'all' })
        return
      case 'critical':
      case 'warning':
      case 'info':
        applyStatFilter({ severity: card })
        return
      case 'active':
      case 'acknowledged':
      case 'resolved':
        applyStatFilter({ status: card })
        return
      default:
        return
    }
  }, [applyStatFilter])

  const handleCloseAlertDetail = () => setSelectedAlertId(null)

  // 格式化最后刷新时间
  const formatLastRefreshed = () => {
    return formatTimeHMS(lastRefreshed)
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
        ) : statsError ? (
          <ErrorAlert
            title="统计数据加载失败"
            message="无法加载告警统计数据，请检查网络连接或稍后重试。"
            error={statsError}
            onRetry={loadStats}
            variant="warning"
          />
        ) : stats ? (
          <AlertStatsGrid stats={stats} onCardClick={handleStatCardClick} />
        ) : null}

        {/* 主内容区 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>告警列表</CardTitle>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                最后刷新: {formatLastRefreshed()}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col overflow-hidden pt-0">
            <CompactPageToolbar
              testIdPrefix="alerts-toolbar"
              filters={(
                <AlertFiltersBar
                  filters={filters}
                  onFilterChange={updateFilter}
                  selectedCount={selectedAlerts.length}
                  onBulkAction={handleBulkActionClick}
                  renderAsCard={false}
                />
              )}
              secondaryActions={[
                {
                  key: 'toggle-auto-refresh',
                  label: autoRefresh ? '自动刷新开' : '自动刷新关',
                  icon: autoRefresh ? (
                    <Bell className="h-4 w-4 text-green-500" />
                  ) : (
                    <BellOff className="h-4 w-4 text-gray-400" />
                  ),
                  variant: 'outline',
                  onClick: () => setAutoRefresh(!autoRefresh),
                },
                {
                  key: 'refresh-alerts',
                  label: '刷新',
                  icon: <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />,
                  disabled: loading,
                  onClick: handleManualRefresh,
                },
              ]}
              primaryActions={[
                {
                  key: 'export-alerts',
                  label: exporting ? '导出中...' : '导出',
                  icon: <Download className="h-4 w-4 mr-2" />,
                  disabled: exporting,
                  onClick: handleExport,
                },
              ]}
              customActions={(
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" type="button">
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

                  {selectedAlerts.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" type="button">
                          批量操作 ({selectedAlerts.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdateAlerts && (
                          <>
                            <DropdownMenuItem onClick={() => handleBulkActionClick('acknowledge')}>
                              <CheckCheck className="h-4 w-4 mr-2" />
                              批量确认
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkActionClick('resolve')}>
                              <CheckCheck className="h-4 w-4 mr-2" />
                              批量解决
                            </DropdownMenuItem>
                          </>
                        )}
                        {canDeleteAlerts && (
                          <DropdownMenuItem
                            onClick={() => handleBulkActionClick('delete')}
                            className="text-red-600"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            批量删除
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            />

            <AdvancedFilters
              value={advancedFilters}
              onFilterChange={handleAdvancedFilterChange}
              onReset={handleAdvancedFilterReset}
              renderAsCard={false}
            />

            {realtimePendingCount > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-foreground">
                    收到 {realtimePendingCount} 条实时更新
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? '已开启筛选，部分更新可能被隐藏。'
                    : currentPage !== 1
                      ? '当前不在第一页，列表未自动刷新。'
                      : !autoRefresh
                        ? '已关闭自动刷新。'
                        : '列表未自动刷新。'}
                  {realtimePendingAt
                    ? `（最后一条：${formatTimeHMS(realtimePendingAt)}）`
                    : null}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={() => void applyRealtimeUpdates()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新列表
                  </Button>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={handleClearFiltersAndView}>
                      清空筛选查看
                    </Button>
                  )}
                  {!hasActiveFilters && currentPage !== 1 && (
                    <Button variant="ghost" size="sm" onClick={handleGoToFirstPageAndView}>
                      回到第一页
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearRealtimePending}>
                    忽略
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-y-auto flex-1">
              {loading ? (
                <SkeletonList count={pageSize} itemHeight="h-24" spacing="space-y-3" />
              ) : error ? (
                <div className="py-6">
                  <ErrorAlert
                    title="告警列表加载失败"
                    message="无法加载告警列表数据，请检查网络连接或稍后重试。"
                    error={error}
                    onRetry={handleManualRefresh}
                  />
                  {hasActiveFilters && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleClearFiltersAndView}>
                        清空筛选并重试
                      </Button>
                    </div>
                  )}
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground/80 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {hasActiveFilters ? '没有匹配的告警' : '暂无告警'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {hasActiveFilters
                      ? '当前筛选条件下没有匹配的告警记录，可尝试清空筛选或调整条件。'
                      : '当前系统暂无告警记录。'}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleManualRefresh}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      刷新
                    </Button>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={handleClearFiltersAndView}>
                        清空筛选
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <AlertList
                  alerts={alerts}
                  selectedAlerts={selectedAlerts}
                  onSelectAlert={toggleAlert}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  canUpdate={canUpdateAlerts}
                  canDelete={canDeleteAlerts}
                  onAcknowledge={canUpdateAlerts ? handleAcknowledgeAndRefresh : undefined}
                  onResolve={canUpdateAlerts ? handleResolveAndRefresh : undefined}
                  onDelete={canDeleteAlerts ? handleDeleteAndRefresh : undefined}
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
          alertId={selectedAlertId}
          alert={selectedAlert}
          onClose={handleCloseAlertDetail}
          onAcknowledge={canUpdateAlerts ? handleAcknowledgeAndRefresh : undefined}
          onResolve={canUpdateAlerts ? handleResolveAndRefresh : undefined}
          onDelete={canDeleteAlerts ? handleDeleteAndRefresh : undefined}
        />
      )}
    </AppLayout>
  )
}

export const AlertsView: React.FC = () => {
  const canReadAlerts = usePermission(Permission.ALERTS_READ)

  if (!canReadAlerts) {
    return <AlertsAccessDenied />
  }

  return <AlertsViewContent />
}
