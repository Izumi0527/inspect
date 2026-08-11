/**
 * 日志中心主视图
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import {
  useLogs,
  useLogStats,
  useLogFilters,
  useLogSelection,
  useLogCollection
} from '../hooks/useLogs'
import { exportLogs as exportLogsApi } from '../api/logsApi'
import { LogStatsGrid } from './LogStatsGrid'
import { LogFiltersBar } from './LogFiltersBar'
import { LogList } from './LogList'
import { LogDetailModal } from './LogDetailModal'
import { LogCollectionModal } from './LogCollectionModal'
import { SkeletonCard, SkeletonList } from '@/components/atoms/skeleton'
import { CompactPageToolbar } from '@/components/shared'
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
  const router = useRouter()
  const canManageLogs = usePermission(Permission.SYSTEM_LOGS_MANAGE)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedLog, setSelectedLog] = useState<DeviceLog | null>(null)
  const [collectionOpen, setCollectionOpen] = useState(false)

  // 获取过滤器状态
  const { filters, updateFilter, queryParams } = useLogFilters()

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
  const { collecting, progress, collectLogs, batchCollect } = useLogCollection()

  // 分页越界自愈（例如批量删除导致总页数减少）
  const totalPages = useMemo(() => {
    const size = pagination.pageSize || pageSize
    if (size <= 0) return 0
    return Math.ceil(pagination.total / size)
  }, [pagination.pageSize, pagination.total, pageSize])

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
      clearSelection()
    }
  }, [clearSelection, currentPage, totalPages])

  // 处理分页
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    clearSelection()
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
    clearSelection()
  }

  // 处理过滤器变更时重置页码
  const handleFilterChange = <K extends keyof typeof filters>(
    key: K,
    value: typeof filters[K]
  ) => {
    updateFilter(key, value)
    setCurrentPage(1)
    clearSelection()
  }

  // 处理批量删除
  const handleBatchDelete = async () => {
    if (!canManageLogs) {
      toast.error('无权限执行批量删除')
      return
    }
    if (selectedLogs.length === 0) {
      toast.error('请先选择要删除的日志')
      return
    }

    if (confirm(`确定要删除选中的 ${selectedLogs.length} 条日志吗？`)) {
      const ok = await batchDeleteLogs(selectedLogs)
      if (ok) {
        clearSelection()
        await refreshStats()
      }
    }
  }

  // 处理单条删除
  const handleDeleteLog = async (logId: number) => {
    if (!canManageLogs) {
      toast.error('无权限删除日志')
      return
    }

    if (!confirm('确定要删除这条日志吗？')) {
      return
    }

    const ok = await deleteLog(logId)
    if (ok) {
      await refreshStats()
    }
  }

  // 处理刷新
  const handleRefresh = async () => {
    const [logsOk, statsOk] = await Promise.all([
      loadLogs({ showToast: false }),
      refreshStats(),
    ])

    if (logsOk && statsOk) {
      toast.success('数据已刷新')
      return
    }

    if (logsOk && !statsOk) {
      toast.success('日志已刷新，但统计刷新失败')
      return
    }

    if (!logsOk && statsOk) {
      toast.error('日志刷新失败，请重试')
      return
    }

    toast.error('刷新失败，请重试')
  }

  // 处理日志点击
  const handleLogClick = (log: DeviceLog) => {
    setSelectedLog(log)
  }

  // 处理导出
  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      const blob = await exportLogsApi({
        level: queryParams.level,
        facility: queryParams.facility,
        source: queryParams.source,
        start_time: queryParams.start_time,
        end_time: queryParams.end_time,
        search: queryParams.search,
        format,
        include_raw: true,
        include_stats: format === 'xlsx',
      })

      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `logs_export_${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      toast.success(`日志导出成功 (${format.toUpperCase()})`)
    } catch (error) {
      console.error('Export failed:', error)
      const message = error instanceof Error ? error.message : '导出失败，请重试'
      toast.error(message)
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
      <div className="flex flex-col gap-4 h-full">
        {/* 日志统计 */}
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

        {/* 主内容卡片 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-0">
            <CardTitle>日志列表</CardTitle>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-hidden">
            <CompactPageToolbar
              testIdPrefix="logs-toolbar"
              filters={(
                <LogFiltersBar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  selectedCount={canManageLogs ? selectedLogs.length : 0}
                  renderAsToolbar
                />
              )}
              secondaryActions={[
                {
                  key: 'refresh-logs',
                  label: '刷新',
                  icon: <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />,
                  disabled: loading,
                  onClick: () => void handleRefresh(),
                },
              ]}
              primaryActions={
                canManageLogs
                  ? [
                      {
                        key: 'collect-logs',
                        label: '采集日志',
                        icon: <Play className={`h-4 w-4 ${collecting ? 'animate-pulse' : ''}`} />,
                        disabled: collecting,
                        variant: 'outline',
                        onClick: () => setCollectionOpen(true),
                      },
                    ]
                  : []
              }
              customActions={(
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" type="button">
                        <Download className="h-4 w-4 mr-2" />
                        导出
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExport('csv')}>
                        <Download className="h-4 w-4 mr-2" />
                        导出为 CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport('xlsx')}>
                        <Download className="h-4 w-4 mr-2" />
                        导出为 Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {canManageLogs && selectedLogs.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" type="button">
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

                  <Button
                    variant="ghost"
                    type="button"
                    aria-label="日志设置"
                    onClick={() => router.push('/settings?tab=logs')}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </>
              )}
            />

            {/* 日志列表 */}
            <div className="flex-1 overflow-hidden border border-border rounded-lg">
              {loading ? (
                <SkeletonList count={pageSize} itemHeight="h-20" spacing="space-y-0" />
              ) : (
                <LogList
                  logs={logs}
                  selectedLogs={selectedLogs}
                  onSelectLog={toggleLog}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onDelete={canManageLogs ? handleDeleteLog : undefined}
                  onLogClick={handleLogClick}
                  onRefresh={() => {
                    void loadLogs()
                  }}
                  loading={loading}
                  enableSelection={canManageLogs}
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

      <LogCollectionModal
        open={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        collecting={collecting}
        progress={progress}
        onCollectSingle={(deviceId, options) => collectLogs(deviceId, options)}
        onCollectBatch={(deviceIds, options) => batchCollect(deviceIds, options)}
        onAfterCollect={async () => {
          await Promise.all([loadLogs({ showToast: false }), refreshStats()])
        }}
      />
    </AppLayout>
  )
}
