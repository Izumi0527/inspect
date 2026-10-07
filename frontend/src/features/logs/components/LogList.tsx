/**
 * 日志列表组件
 */
import React from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/atoms/pagination'
import { LogListItem } from './LogListItem'
import type { DeviceLog } from '../types'

interface PaginationProps {
  current: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

interface LogListProps {
  logs: DeviceLog[]
  selectedLogs: number[]
  onSelectLog: (logId: number) => void
  onSelectAll: (logIds: number[]) => void
  onClearSelection: () => void
  onDelete?: (logId: number) => void
  onLogClick?: (log: DeviceLog) => void
  onRefresh?: () => void
  pagination: PaginationProps
  loading?: boolean
  enableSelection?: boolean
}

export const LogList: React.FC<LogListProps> = ({
  logs,
  selectedLogs,
  onSelectLog,
  onSelectAll,
  onClearSelection,
  onDelete,
  onLogClick,
  onRefresh,
  pagination,
  loading = false,
  enableSelection = true
}) => {
  const selectedCountOnPage = enableSelection
    ? logs.reduce((count, log) => count + (selectedLogs.includes(log.id) ? 1 : 0), 0)
    : 0
  const allSelected = enableSelection && logs.length > 0 && selectedCountOnPage === logs.length
  const someSelected = enableSelection && selectedCountOnPage > 0 && !allSelected

  const handleSelectAll = () => {
    if (!enableSelection) return
    if (allSelected) {
      onClearSelection()
    } else {
      onSelectAll(logs.map(log => log.id))
    }
  }

  const totalPages = pagination.pageSize > 0 ? Math.ceil(pagination.total / pagination.pageSize) : 0

  return (
    <div className="flex flex-col">
      {/* 列表头部 */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-muted">
        <div className="flex items-center gap-3">
          {enableSelection && (
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={handleSelectAll}
            />
          )}
          <span className="text-sm text-muted-foreground">
            共 {pagination.total.toLocaleString()} 条日志
          </span>
        </div>

        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto">
        {!loading && logs.length === 0 && pagination.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <FileText className="h-16 w-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">暂无日志数据</p>
            <p className="text-sm text-gray-400 mb-4">
              尝试调整过滤条件或采集设备日志
            </p>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
            )}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            本页暂无日志，请翻页或调整过滤条件
          </div>
        ) : (
          logs.map(log => (
            <LogListItem
              key={log.id}
              log={log}
              isSelected={enableSelection ? selectedLogs.includes(log.id) : false}
              enableSelection={enableSelection}
              onSelect={enableSelection ? onSelectLog : undefined}
              onDelete={onDelete}
              onClick={onLogClick}
            />
          ))
        )}
      </div>

      {/* 分页：复用全站统一的分页组件（含每页条数，位于页脚） */}
      <div data-slot="table-footer" className="border-t border-border">
        <Pagination
          className="px-4"
          currentPage={pagination.current}
          totalPages={Math.max(1, totalPages)}
          totalItems={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      </div>
    </div>
  )
}
