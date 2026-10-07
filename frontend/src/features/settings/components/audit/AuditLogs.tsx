'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { useDateFilters } from '@/hooks/useDateFilters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/atoms/pagination'
import { Activity, FileText, ShieldCheck, Download, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { EmptyState } from '../shared/EmptyState'
import { AuditLogDetailDialog } from './AuditLogDetailDialog'
import { AuditLogFilters } from './AuditLogFilters'
import { actionLabels } from './audit.constants'
import { buildAuditDateRangeQuery } from './auditDateRange'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { toast } from 'react-hot-toast'
import type { AuditAction, AuditLog } from '../../types/audit.types'
import type { SettingsStatCardDescriptor } from '@/features/settings/types/shell.types'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'

// 状态Badge
function StatusBadge({ status }: { status: 'success' | 'failed' }) {
  return status === 'success' ? (
    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 gap-1">
      <CheckCircle className="w-3 h-3" />
      成功
    </Badge>
  ) : (
    <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 gap-1">
      <XCircle className="w-3 h-3" />
      失败
    </Badge>
  )
}

// 格式化日期（统一走中央工具）
function formatDate(isoString: string): string {
  return formatDateTimeYMDHMS(isoString)
}

export function AuditLogs() {
  const {
    logs,
    totalCount,
    page,
    pageSize,
    queryParams,
    stats,
    isLoading,
    error,
    refetch,
    updateQueryParams,
    exportLogs,
  } = useAuditLogs()
  const { getDateRange } = useDateFilters()

  // 服务端回包到达前以本地查询参数为准，避免「每页条数」选择器短暂回跳旧值
  const effectivePageSize = queryParams?.pageSize ?? pageSize

  // 搜索关键词
  const [keyword, setKeyword] = useState('')

  // 高级筛选状态
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('')
  const [filterStatus, setFilterStatus] = useState<'success' | 'failed' | ''>('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // 详情弹窗
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  // 筛选变化时触发查询（排除初始挂载无筛选的情况）
  useEffect(() => {
    if (filterAction || filterStatus || filterStartDate || filterEndDate) {
      const dateRangeQuery = buildAuditDateRangeQuery(filterStartDate, filterEndDate)
      updateQueryParams({
        action: filterAction || undefined,
        status: filterStatus || undefined,
        ...dateRangeQuery,
        page: 1,
      })
    }
  }, [filterAction, filterStatus, filterStartDate, filterEndDate])

  // 清除所有筛选
  const handleClearFilters = useCallback(() => {
    setFilterAction('')
    setFilterStatus('')
    setFilterStartDate('')
    setFilterEndDate('')
    updateQueryParams({
      action: undefined,
      status: undefined,
      startDate: undefined,
      endDate: undefined,
      page: 1,
    })
  }, [updateQueryParams])

  // 是否有活跃筛选
  const hasActiveFilters = Boolean(filterAction || filterStatus || filterStartDate || filterEndDate)
  const hasDateFilter = Boolean(filterStartDate || filterEndDate)

  const handleQuickDateFilter = useCallback((range: 'today' | 'week' | 'month') => {
    const dateRange = getDateRange(range)
    setFilterStartDate(dateRange.startDate)
    setFilterEndDate(dateRange.endDate)
  }, [getDateRange])

  const handleClearDateRange = useCallback(() => {
    setFilterStartDate('')
    setFilterEndDate('')
    updateQueryParams({
      action: filterAction || undefined,
      status: filterStatus || undefined,
      startDate: undefined,
      endDate: undefined,
      page: 1,
    })
  }, [filterAction, filterStatus, updateQueryParams])

  // 处理导出
  const handleExport = useCallback(async () => {
    try {
      await exportLogs()
      toast.success('审计日志导出成功！')
    } catch (err) {
      toast.error('导出失败：' + (err as Error).message)
    }
  }, [exportLogs])

  // 高级筛选器 JSX（注入 toolbar.filters 插槽）
  const filters = useMemo(() => (
    <AuditLogFilters
      actionFilter={filterAction}
      statusFilter={filterStatus}
      startDate={filterStartDate}
      endDate={filterEndDate}
      hasDateFilter={hasDateFilter}
      hasAnyFilter={hasActiveFilters}
      onActionChange={setFilterAction}
      onStatusChange={setFilterStatus}
      onStartDateChange={setFilterStartDate}
      onEndDateChange={setFilterEndDate}
      onClearDateRange={handleClearDateRange}
      onClearAllFilters={handleClearFilters}
      onQuickDateFilter={handleQuickDateFilter}
    />
  ), [
    filterAction,
    filterStatus,
    filterStartDate,
    filterEndDate,
    hasDateFilter,
    hasActiveFilters,
    handleClearDateRange,
    handleClearFilters,
    handleQuickDateFilter,
  ])

  const toolbar = useMemo(
    () => ({
      layout: 'end' as const,
      search: {
        value: keyword,
        placeholder: '搜索日志...',
        ariaLabel: '搜索审计日志',
        onChange: setKeyword,
        onSubmit: () => updateQueryParams({ keyword, page: 1 }),
      },
      filters,
    }),
    [keyword, updateQueryParams, filters]
  )

  const primaryActions = useMemo(
    () => [
      {
        key: 'export-logs',
        label: '导出日志',
        icon: <Download className="w-4 h-4 mr-2" />,
        onClick: () => void handleExport(),
      },
    ],
    [handleExport]
  )

  const secondaryActions = useMemo(
    () => [
      {
        key: 'refresh',
        label: '刷新',
        icon: <RefreshCw className="w-4 h-4 mr-2" />,
        disabled: Boolean(isLoading),
        onClick: () => void refetch(),
      },
    ],
    [isLoading, refetch]
  )

  // Shell 统计卡
  const statsDescriptors = useMemo((): SettingsStatCardDescriptor[] => {
    if (!stats) return []
    return [
      {
        key: 'total',
        title: '总日志数',
        value: stats.totalLogs.toLocaleString(),
        icon: FileText,
        iconClassName: 'text-blue-600 dark:text-blue-400',
      },
      {
        key: 'today',
        title: '今日日志',
        value: stats.todayLogs.toLocaleString(),
        icon: Activity,
        iconClassName: 'text-green-600 dark:text-green-400',
      },
      {
        key: 'rate',
        title: '操作成功率',
        value: `${Math.round(stats.successRate * 100)}%`,
        icon: ShieldCheck,
        iconClassName: 'text-amber-600 dark:text-amber-400',
      },
    ]
  }, [stats])

  useSettingsTabCapabilities('audit', {
    headerLayout: 'inline',
    stats: statsDescriptors,
    toolbar,
    primaryActions,
    secondaryActions,
  })

  // 加载状态
  if (isLoading && !logs.length) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
      {/* 详情弹窗 */}
      <AuditLogDetailDialog
        open={Boolean(detailLog)}
        log={detailLog}
        onOpenChange={(open) => {
          if (!open) setDetailLog(null)
        }}
      />

      {/* 日志列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        {error && !logs.length ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={AlertCircle}
              title="加载审计日志失败"
              description={(error as Error).message || '无法连接到服务器，请稍后重试'}
              action={{
                label: '重试',
                onClick: () => void refetch(),
              }}
            />
          </div>
        ) : !logs.length ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={FileText}
              title="暂无审计日志"
              description="当前筛选条件下暂无数据，可尝试调整关键词或筛选条件后再查询。"
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">时间</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">用户</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">操作</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">资源</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">详情</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">IP地址</th>
                  <th className="sticky top-0 z-10 px-4 py-3 text-left font-medium text-muted-foreground bg-muted">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setDetailLog(log)}
                    title="点击查看详情"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{actionLabels[log.action] || log.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.resource}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.ipAddress}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页：复用全站统一的分页组件（含每页条数） */}
        <div data-slot="table-footer" className="border-t border-border">
          <Pagination
            className="px-4"
            currentPage={queryParams?.page ?? page}
            totalPages={Math.max(1, Math.ceil(totalCount / effectivePageSize))}
            totalItems={totalCount}
            pageSize={effectivePageSize}
            onPageChange={(nextPage) => updateQueryParams({ page: nextPage })}
            onPageSizeChange={(nextPageSize) =>
              updateQueryParams({ page: 1, pageSize: nextPageSize })
            }
          />
        </div>
      </div>
    </div>
  )
}
