import React, { useState, useMemo } from 'react'
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
import { SkeletonCard, SkeletonList } from '@/components/atoms/skeleton'
import { AdvancedFilters, AdvancedFilterValues } from './AdvancedFilters'

export const AlertsView: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>({})

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">加载告警数据时出现错误</div>
            <p className="text-gray-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AppLayout title="告警中心">
      <div className="max-w-7xl mx-auto space-y-8">
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

        {/* Filters and Search */}
        <div className="mb-6">
          <AlertFiltersBar
            filters={filters}
            onFilterChange={updateFilter}
            selectedCount={selectedAlerts.length}
            onBulkAction={handleBulkActionClick}
          />
        </div>

        {/* Advanced Filters */}
        <div className="mb-6">
          <AdvancedFilters
            onFilterChange={handleAdvancedFilterChange}
            onReset={handleAdvancedFilterReset}
          />
        </div>

        {/* Alerts List */}
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
          />
        )}
      </div>
    </AppLayout>
  )
}