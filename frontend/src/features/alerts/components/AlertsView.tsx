import React, { useState, useMemo, useEffect } from 'react'
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
import { Download, CheckCheck, XCircle } from 'lucide-react'

export const AlertsView: React.FC = () => {
  const searchParams = useSearchParams()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>({})
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)

  // 获取过滤器状态
  const { filters, updateFilter } = useAlertFilters()

  // 构建查询参数 - 合并基础过滤器和高级过滤器
  const queryParams = useMemo(() => {
    const params: any = {
      page: currentPage,
      pageSize
    }

    // 基础过滤器：搜索
    if (filters.searchQuery || advancedFilters.search) {
      params.search = advancedFilters.search || filters.searchQuery
    }

    // 高级过滤器：严重级别（优先使用高级过滤器）
    if (advancedFilters.severity && advancedFilters.severity.length > 0) {
      params.severity = advancedFilters.severity
    } else if (filters.severityFilter && filters.severityFilter !== 'all') {
      params.severity = [filters.severityFilter]
    }

    // 高级过滤器：状态（优先使用高级过滤器）
    if (advancedFilters.status && advancedFilters.status.length > 0) {
      params.status = advancedFilters.status
    } else if (filters.statusFilter && filters.statusFilter !== 'all') {
      params.status = [filters.statusFilter]
    }

    // 高级过滤器：分类
    if (advancedFilters.category && advancedFilters.category.length > 0) {
      params.category = advancedFilters.category
    }

    // 高级过滤器：日期范围
    if (advancedFilters.dateRange) {
      if (advancedFilters.dateRange.start) {
        params.startDate = advancedFilters.dateRange.start
      }
      if (advancedFilters.dateRange.end) {
        params.endDate = advancedFilters.dateRange.end
      }
    }

    // 高级过滤器：设备ID
    if (advancedFilters.deviceIds && advancedFilters.deviceIds.length > 0) {
      params.deviceIds = advancedFilters.deviceIds
    }

    return params
  }, [currentPage, pageSize, filters, advancedFilters])

  // 使用自定义hooks
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

  const { stats, loading: statsLoading } = useAlertStats()
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

  // 处理 URL 参数中的告警 ID
  useEffect(() => {
    const alertId = searchParams.get('id')
    if (alertId) {
      // 如果 URL 中有告警 ID，自动打开详情弹窗
      setSelectedAlertId(alertId)
    }
  }, [searchParams])

  // 处理批量操作
  const handleBulkActionClick = async (action: AlertAction) => {
    try {
      await handleBulkAction(action)
      // 重新加载数据
      await loadAlerts()
    } catch (error) {
      console.error('批量操作失败:', error)
    }
  }

  // 处理分页
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // 处理每页数量变更
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    // 重置到第一页，避免页码超出范围
    setCurrentPage(1)
  }

  // 处理高级过滤器变更
  const handleAdvancedFilterChange = (newFilters: AdvancedFilterValues) => {
    setAdvancedFilters(newFilters)
    // 过滤条件变更时重置到第一页
    setCurrentPage(1)
  }

  // 处理高级过滤器重置
  const handleAdvancedFilterReset = () => {
    setAdvancedFilters({})
    // 重置时也回到第一页
    setCurrentPage(1)
  }

  // 处理关闭告警详情
  const handleCloseAlertDetail = () => {
    setSelectedAlertId(null)
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-600 dark:text-red-500 mb-4">加载告警数据时出现错误</div>
            <p className="text-gray-500 dark:text-gray-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AppLayout title="告警中心">
      <div className="flex flex-col space-y-6 min-h-[calc(100vh-112px)] pb-6">
        {/* Alert Statistics */}
        <div>
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ) : stats ? (
            <AlertStatsGrid stats={stats} />
          ) : null}
        </div>

        {/* Main Card Container */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>告警列表</CardTitle>
              <div className="flex items-center gap-2">
                {/* 导出按钮 */}
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  导出告警
                </Button>

                {/* 批量操作下拉菜单 */}
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

          <CardContent className="flex-1 flex flex-col overflow-hidden">
            {/* Filters and Search - 不使用独立Card */}
            <AlertFiltersBar
              filters={filters}
              onFilterChange={updateFilter}
              selectedCount={selectedAlerts.length}
              onBulkAction={handleBulkActionClick}
              renderAsCard={false}
            />

            {/* Advanced Filters - 不使用独立Card */}
            <AdvancedFilters
              onFilterChange={handleAdvancedFilterChange}
              onReset={handleAdvancedFilterReset}
              renderAsCard={false}
            />

            {/* Alerts List - 不使用独立Card */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <SkeletonList count={pageSize} itemHeight="h-32" spacing="space-y-4" />
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

      {/* 告警详情弹窗 */}
      {selectedAlertId && (
        <AlertDetailModal
          open={!!selectedAlertId}
          alert={selectedAlert}
          onClose={handleCloseAlertDetail}
        />
      )}
    </AppLayout>
  )
}
