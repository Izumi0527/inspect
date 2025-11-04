import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  LoadingOverlay,
  PageLoading,
  ConfirmModal
} from '@/components/atoms'
import {
  useAuditLogs,
  useExportAuditLogs,
  useCleanupAuditLogs
} from '../hooks'
import type { AuditLog } from '../types'

interface Props {
  searchText: string
}

const PAGE_SIZE = 10
const DEFAULT_CLEANUP_DAYS = 30

const formatDateTime = (value: string) => new Date(value).toLocaleString()

const formatDuration = (duration: number) => {
  if (duration < 1000) {
    return `${duration} ms`
  }
  return `${(duration / 1000).toFixed(2)} s`
}

const getStatusVariant = (status: AuditLog['status']) => {
  switch (status) {
    case 'success':
      return 'success' as const
    case 'failed':
      return 'danger' as const
    default:
      return 'outline' as const
  }
}

export const AuditLogs: React.FC<Props> = ({ searchText }) => {
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [searchText])

  const queryParams = useMemo(() => {
    const params: {
      page: number
      pageSize: number
      search?: string
      startDate?: string
      endDate?: string
    } = {
      page,
      pageSize: PAGE_SIZE,
    }
    if (searchText.trim()) {
      params.search = searchText.trim()
    }
    if (startDate) {
      const date = new Date(startDate)
      params.startDate = date.toISOString()
    }
    if (endDate) {
      const date = new Date(endDate)
      date.setHours(23, 59, 59, 999)
      params.endDate = date.toISOString()
    }
    return params
  }, [page, searchText, startDate, endDate])

  const logsQuery = useAuditLogs(queryParams)
  const exportMutation = useExportAuditLogs()
  const cleanupMutation = useCleanupAuditLogs()

  const items = logsQuery.data?.items ?? []
  const total = logsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const overlayActive = logsQuery.isFetching || exportMutation.isPending || cleanupMutation.isPending
  const overlayMessage = exportMutation.isPending
    ? '正在导出审计日志...'
    : cleanupMutation.isPending
      ? '正在清理审计日志...'
      : '正在刷新日志数据...'

  const handleExport = () => {
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const exportStart = startDate ? new Date(startDate) : defaultStart
    const exportEnd = endDate ? new Date(endDate) : now
    exportEnd.setHours(23, 59, 59, 999)

    exportMutation.mutate({
      format: 'csv',
      startDate: exportStart.toISOString(),
      endDate: exportEnd.toISOString()
    })
  }

  const handleCleanup = () => {
    const beforeDate = new Date(Date.now() - DEFAULT_CLEANUP_DAYS * 24 * 60 * 60 * 1000).toISOString()
    cleanupMutation.mutate(beforeDate, {
      onSuccess: () => setCleanupModalOpen(false)
    })
  }

  return (
    <LoadingOverlay isLoading={overlayActive} message={overlayActive ? overlayMessage : undefined}>
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>审计日志</CardTitle>
            <CardDescription>查看系统操作轨迹，支持导出与清理</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCleanupModalOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />清理日志
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exportMutation.isPending}>
              <Download className="mr-2 h-4 w-4" />导出 CSV
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-gray-500">开始日期</label>
              <Input
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">结束日期</label>
              <Input
                type="date"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                  setPage(1)
                }}
              >
                重置时间范围
              </Button>
            </div>
          </div>

          {logsQuery.isLoading ? (
            <PageLoading message="正在加载日志数据..." />
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              暂无符合条件的审计日志记录。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-500">时间</th>
                    <th className="px-4 py-3 font-medium text-gray-500">用户</th>
                    <th className="px-4 py-3 font-medium text-gray-500">操作</th>
                    <th className="px-4 py-3 font-medium text-gray-500">对象</th>
                    <th className="px-4 py-3 font-medium text-gray-500">结果</th>
                    <th className="px-4 py-3 font-medium text-gray-500">IP</th>
                    <th className="px-4 py-3 font-medium text-gray-500">耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(log.timestamp)}</td>
                      <td className="px-4 py-3 text-gray-700">{log.username}</td>
                      <td className="px-4 py-3 text-gray-700">{log.action}</td>
                      <td className="px-4 py-3 text-gray-700">{log.resource}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(log.status)} size="sm">
                          {log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : log.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{log.ip}</td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(log.duration)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              第 {Math.min(page, totalPages)} / {totalPages} 页，共 {total} 条记录
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                下一页<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmModal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        onConfirm={handleCleanup}
        title="清理审计日志"
        description={`将会删除 ${DEFAULT_CLEANUP_DAYS} 天之前的日志记录。建议先导出备份。`}
        confirmText="立即清理"
        cancelText="取消"
        variant="destructive"
      />
    </LoadingOverlay>
  )
}
