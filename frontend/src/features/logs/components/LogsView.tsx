/**
 * 日志中心主视图
 */
import React, { useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout'
import {
  useLogs,
  useLogStats,
  useLogFilters,
  useLogSelection,
  useLogCollection
} from '../hooks/useLogs'
import { LogStatsGrid } from './LogStatsGrid'
import { LogFiltersBar } from './LogFiltersBar'
import { LogList } from './LogList'
import { LogDetailModal } from './LogDetailModal'
import { SkeletonCard, SkeletonList } from '@/components/atoms/skeleton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Download,
  Trash2,
  RefreshCw,
  Play,
  Settings
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import type { DeviceLog } from '../types'

export const LogsView: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedLog, setSelectedLog] = useState<DeviceLog | null>(null)

  // 获取过滤器状态
  const { filters, updateFilter, resetFilters, queryParams } = useLogFilters()

  // 构建完整查询参数
  const fullQueryParams = useMemo(() => ({
    ...queryParams,
    page: currentPage,
    page_size: pageSize
  }), [queryParams, currentPage, pageSize])

  // 使用自定义hooks
  const {
    logs,
    loading,
    error,
    pagination,
    loadLogs,
    deleteLog,
    batchDeleteLogs
  } = useLogs(fullQueryParams)

  const { stats, loading: statsLoading, refresh: refreshStats } = useLogStats()
  const {
    selectedLogs,
    toggleLog,
    selectAll,
    clearSelection
  } = useLogSelection()
  const { collecting } = useLogCollection()

  // 处理分页
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  // 处理过滤器变更时重置页码
  const handleFilterChange = <K extends keyof typeof filters>(
    key: K,
    value: typeof filters[K]
  ) => {
    updateFilter(key, value)
    setCurrentPage(1)
  }

  // 处理批量删除
  const handleBatchDelete = async () => {
    if (selectedLogs.length === 0) {
      toast.error('请先选择要删除的日志')
      return
    }

    if (confirm(`确定要删除选中的 ${selectedLogs.length} 条日志吗？`)) {
      await batchDeleteLogs(selectedLogs)
      clearSelection()
    }
  }

  // 处理刷新
  const handleRefresh = async () => {
    await Promise.all([loadLogs(), refreshStats()])
    toast.success('数据已刷新')
  }

  // 处理日志点击
  const handleLogClick = (log: DeviceLog) => {
    setSelectedLog(log)
  }

  // 处理导出
  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const params = new URLSearchParams()
      
      // 添加过滤参数
      if (filters.level) params.append('level', filters.level)
      if (filters.facility) params.append('facility', filters.facility)
      if (filters.startTime) params.append('start_time', filters.startTime)
      if (filters.endTime) params.append('end_time', filters.endTime)
      if (filters.search) params.append('search', filters.search)
      
      params.append('format', format)
      params.append('include_raw', 'true')
      
      // 构建导出URL
      const exportUrl = `/api/logs/export?${params.toString()}`
      
      // 创建下载链接
      const link = document.createElement('a')
      link.href = exportUrl
      link.download = `logs_export_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'csv'}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`日志导出已开始 (${format.toUpperCase()})`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('导出失败，请重试')
    }
  }

  // 错误状态
  if (error) {
    return (
      <AppLayout title="日志中心">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-red-600 dark:text-red-500 mb-4">加载日志数据时出现错误</div>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <Button onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重试
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="日志中心">
      <div className="flex flex-col space-y-4 min-h-[calc(100vh-112px)] pb-4">
        {/* 日志统计 */}
        <div>
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ) : stats ? (
            <LogStatsGrid stats={stats} />
          ) : null}
        </div>

        {/* 主内容卡片 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>日志列表</CardTitle>
              <div className="flex items-center gap-2">
                {/* 刷新按钮 */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>

                {/* 导出按钮 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      导出
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport('csv')}>
                      <Download className="h-4 w-4 mr-2" />
                      导出为 CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('excel')}>
                      <Download className="h-4 w-4 mr-2" />
                      导出为 Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 采集按钮 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={collecting}>
                      <Play className={`h-4 w-4 mr-2 ${collecting ? 'animate-pulse' : ''}`} />
                      采集日志
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toast.success('请在设备管理页面选择设备进行采集')}>
                      <Play className="h-4 w-4 mr-2" />
                      采集选中设备
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.success('批量采集功能开发中...')}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      批量采集所有设备
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 批量操作 */}
                {selectedLogs.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        批量操作 ({selectedLogs.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={handleBatchDelete}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        批量删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* 设置按钮 */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toast.success('日志设置功能开发中...')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-hidden">
            {/* 过滤器 */}
            <LogFiltersBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onReset={() => {
                resetFilters()
                setCurrentPage(1)
              }}
              selectedCount={selectedLogs.length}
            />

            {/* 日志列表 */}
            <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
              {loading ? (
                <SkeletonList count={pageSize} itemHeight="h-20" spacing="space-y-0" />
              ) : (
                <LogList
                  logs={logs}
                  selectedLogs={selectedLogs}
                  onSelectLog={toggleLog}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onDelete={deleteLog}
                  onLogClick={handleLogClick}
                  onRefresh={loadLogs}
                  loading={loading}
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
          </CardContent>
        </Card>
      </div>

      {/* 日志详情弹窗 */}
      <LogDetailModal
        open={!!selectedLog}
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </AppLayout>
  )
}
