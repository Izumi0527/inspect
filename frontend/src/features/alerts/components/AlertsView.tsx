import React, { useState } from 'react'
import { AppLayout } from '@/components/layout'
import { 
  useAlerts, 
  useAlertStats, 
  useAlertFilters, 
  useAlertSelection,
  useFilteredAlerts 
} from '../hooks/useAlerts'
import { AlertStatsGrid } from './AlertStatsGrid'
import { AlertAction } from '../types'
import { AlertFiltersBar } from './AlertFiltersBar'
import { AlertList } from './AlertList'

export const AlertsView: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // 基础查询参数
  const queryParams = {
    page: currentPage,
    pageSize
  }

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
  const { filters, updateFilter } = useAlertFilters()
  const { 
    selectedAlerts, 
    toggleAlert, 
    selectAll, 
    clearSelection, 
    handleBulkAction 
  } = useAlertSelection()

  // 客户端筛选（如果需要实时筛选）
  const filteredAlerts = useFilteredAlerts(alerts, filters)

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
        {stats && !statsLoading && (
          <div>
            <AlertStatsGrid stats={stats} />
          </div>
        )}

        {/* Filters and Search */}
        <div className="mb-6">
          <AlertFiltersBar
            filters={filters}
            onFilterChange={updateFilter}
            selectedCount={selectedAlerts.length}
            onBulkAction={handleBulkActionClick}
          />
        </div>

        {/* Alerts List */}
        <AlertList
          alerts={filteredAlerts}
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
            onPageChange: handlePageChange
          }}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">正在加载告警数据...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}