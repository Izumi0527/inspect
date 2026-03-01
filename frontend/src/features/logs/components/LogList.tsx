/**
 * 日志列表组件
 */
import React from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  onDelete: (logId: number) => void
  onLogClick?: (log: DeviceLog) => void
  onRefresh?: () => void
  pagination: PaginationProps
  loading?: boolean
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
  loading = false
}) => {
  const allSelected = logs.length > 0 && logs.every(log => selectedLogs.includes(log.id))
  const someSelected = selectedLogs.length > 0 && !allSelected

  const handleSelectAll = () => {
    if (allSelected) {
      onClearSelection()
    } else {
      onSelectAll(logs.map(log => log.id))
    }
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  // 空状态
  if (!loading && logs.length === 0) {
    return (
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
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 列表头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            // @ts-ignore
            indeterminate={someSelected}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            共 {pagination.total.toLocaleString()} 条日志
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 每页数量选择 */}
          <select
            value={pagination.pageSize}
            onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
            className="text-sm border border-border rounded-md px-2 py-1 bg-card"
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
            <option value={100}>100条/页</option>
          </select>

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
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto">
        {logs.map(log => (
          <LogListItem
            key={log.id}
            log={log}
            isSelected={selectedLogs.includes(log.id)}
            onSelect={onSelectLog}
            onDelete={onDelete}
            onClick={onLogClick}
          />
        ))}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
          <span className="text-sm text-muted-foreground">
            第 {pagination.current} / {totalPages} 页
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.current - 1)}
              disabled={pagination.current <= 1}
            >
              上一页
            </Button>

            {/* 页码按钮 */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (pagination.current <= 3) {
                  pageNum = i + 1
                } else if (pagination.current >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = pagination.current - 2 + i
                }

                return (
                  <Button
                    key={pageNum}
                    variant={pagination.current === pageNum ? 'default' : 'outline'}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => pagination.onPageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.current + 1)}
              disabled={pagination.current >= totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
