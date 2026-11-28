import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateYMD, formatTimeHMS, formatDateTimeYMDHMS } from '@/utils/formatters'
import { useQueryClient } from '@tanstack/react-query'
import {
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  User,
  Eye,
  Download,
  Trash2,
  AlertTriangle,
  Hand,
  Server,
  X,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Pagination,
} from '@/components/atoms'
import {
  CompactPageToolbar,
  FloatingBatchActionBar,
  BatchDeleteConfirmModal,
} from '@/components/shared'
import { DeleteIconButton } from '@/components/shared/DeleteIconButton'
import { SimpleModal } from '@/components/atoms/modal'
import { useBatchSelection } from '@/hooks'
import { cn } from '@/utils/cn'
import {
  useInspectionExecutions,
  useStopExecution,
  useGenerateReport,
  useDeleteExecution,
  useBatchDeleteExecutions,
} from '../hooks/useInspection'
import { useURLFilters } from '../hooks/useURLFilters'
import { useDateFilters } from '../hooks/useDateFilters'
import { InspectionExecution } from '../types'
import {
  clampProgress,
  formatDateRangeFilterLabel,
  formatExecutionDuration,
  formatStatusFilterLabel,
  getExecutionScoreMeta,
  getExecutionStatusMeta,
  getTriggerMeta,
  normalizeExecutionSummary,
} from '../utils/executionPresentation'
import { ExecutionDetailModal } from './ExecutionDetailModal'
import { ExecutionFilters } from './ExecutionFilters'
import { ExecutionTableSkeleton } from './ExecutionTableSkeleton'
import { ExecutionEmptyState } from './ExecutionEmptyState'
import { useWebSocketEvent, WebSocketEvents, wsManager } from '@/lib/websocket'

// 自动刷新间隔（毫秒）- 当有执行中的任务时
const AUTO_REFRESH_INTERVAL = 10000

const getStatusBadgeIcon = (status: string) => {
  switch (status) {
    case 'running':
      return <RefreshCw className="w-3 h-3 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-3 h-3" />
    case 'failed':
      return <XCircle className="w-3 h-3" />
    case 'cancelled':
      return <Square className="w-3 h-3" />
    default:
      return <Clock className="w-3 h-3" />
  }
}

export const InspectionExecutions: React.FC = () => {
  const queryClient = useQueryClient()
  const terminalInvalidatedIdsRef = useRef<Set<string>>(new Set())

  // 使用URL筛选hooks
  const { filters, updateFilter, updateFilters, resetFilters } = useURLFilters()
  const { getDateRange } = useDateFilters()

  // 本地状态
  const [selectedExecution, setSelectedExecution] = useState<InspectionExecution | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [executionToDelete, setExecutionToDelete] = useState<InspectionExecution | null>(null)

  const parsedDeviceId = filters.deviceId ? Number(filters.deviceId) : undefined
  const { data: executionsData, isLoading, refetch, isFetching, error } = useInspectionExecutions({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status !== 'all' ? filters.status : undefined,
    deviceId: parsedDeviceId && Number.isInteger(parsedDeviceId) && parsedDeviceId > 0 ? parsedDeviceId : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  })
  const stopExecution = useStopExecution()
  const generateReport = useGenerateReport()
  const deleteExecution = useDeleteExecution()
  const batchDeleteExecutions = useBatchDeleteExecutions()
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)

  const executions: InspectionExecution[] = useMemo(
    () => executionsData?.items ?? [],
    [executionsData?.items]
  )

  const totalPages = Math.max(1, executionsData?.pages || 1)
  const totalItems = executionsData?.total || 0

  // 页码越界自动回退，防止删除末页最后一条记录后停在空页
  useEffect(() => {
    if (!isLoading && !isFetching && executionsData && filters.page > totalPages) {
      updateFilter('page', totalPages)
    }
  }, [isLoading, isFetching, executionsData, filters.page, totalPages, updateFilter])

  // 运行中的任务数量与布尔标志
  const runningCount = useMemo(
    () => executions.filter((execution) => execution.status === 'running').length,
    [executions]
  )
  const hasRunningExecutions = runningCount > 0

  const filteredExecutions = useMemo(
    () => executions,
    [executions]
  )

  const batchSelection = useBatchSelection<InspectionExecution>({
    items: filteredExecutions,
    totalCount: totalItems,
    getId: (e) => e.id,
    isSelectable: (e) => e.status !== 'running',
    getDisabledReason: (e) => (e.status === 'running' ? '执行中的任务不可删除' : undefined),
    filterDeps: [filters.status, filters.startDate, filters.endDate, filters.deviceId],
    pageDeps: [filters.page, filters.pageSize],
  })

  // 清除选中的执行记录（如果不存在）
  useEffect(() => {
    if (
      selectedExecution &&
      !executions.some((execution) => execution.id === selectedExecution.id)
    ) {
      setSelectedExecution(null)
    }
  }, [executions, selectedExecution])

  // 当有执行中的任务时，自动刷新
  useEffect(() => {
    if (!hasRunningExecutions) return

    const intervalId = setInterval(() => {
      refetch()
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(intervalId)
  }, [hasRunningExecutions, refetch])

  // 订阅巡检执行进度（WebSocket room=scan_progress）
  useEffect(() => {
    wsManager.subscribeToInspectionTasks()
    return () => {
      wsManager.unsubscribeFromInspectionTasks()
    }
  }, [])

  // 连接建立/重连时重新订阅，避免订阅丢失
  useWebSocketEvent(WebSocketEvents.CONNECT, () => {
    wsManager.subscribeToInspectionTasks()
  })

  // WebSocket 实时进度更新：更新缓存与本地选中状态
  useWebSocketEvent(WebSocketEvents.INSPECTION_PROGRESS, (payload) => {
    if (!payload || typeof payload !== 'object') return

    const data = payload as Record<string, unknown>
    const rawId = data.id
    const executionId =
      typeof rawId === 'string' ? rawId.trim() :
      typeof rawId === 'number' && Number.isFinite(rawId) ? String(rawId) : ''
    if (!executionId) return

    const rawProgress = data.progress
    const progress =
      typeof rawProgress === 'number' && Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(100, Math.round(rawProgress)))
        : undefined

    const rawStatus = data.status
    const status = (() => {
      if (typeof rawStatus !== 'string') return undefined
      const normalized = rawStatus.trim().toLowerCase()
      switch (normalized) {
        case 'pending':
        case 'running':
        case 'completed':
        case 'failed':
        case 'cancelled':
          return normalized
        case 'canceled':
          return 'cancelled'
        default:
          return undefined
      }
    })()

    // 更新所有 executions 列表缓存（不同分页/筛选条件）
    queryClient.setQueriesData({ queryKey: ['inspection', 'executions'] }, (oldData) => {
      if (!oldData || typeof oldData !== 'object') return oldData
      const record = oldData as { items?: unknown }
      if (!Array.isArray(record.items)) return oldData

      let changed = false
      const nextItems = record.items.map((item) => {
        if (!item || typeof item !== 'object') return item
        const execution = item as InspectionExecution
        if (execution.id !== executionId) return execution

        const next: InspectionExecution = {
          ...execution,
          ...(progress !== undefined ? { progress } : {}),
          ...(status ? { status } : {}),
        }

        if (next.progress !== execution.progress || next.status !== execution.status) {
          changed = true
        }
        return next
      })

      if (!changed) return oldData
      return { ...(oldData as Record<string, unknown>), items: nextItems }
    })

    // 更新详情缓存（弹窗内 useExecutionDetail）
    queryClient.setQueryData(['inspection', 'execution', 'detail', executionId], (oldData) => {
      if (!oldData || typeof oldData !== 'object') return oldData
      const execution = oldData as InspectionExecution
      const next: InspectionExecution = {
        ...execution,
        ...(progress !== undefined ? { progress } : {}),
        ...(status ? { status } : {}),
      }
      if (next.progress === execution.progress && next.status === execution.status) return oldData
      return next
    })

    // 更新另一个详情缓存（useInspectionExecution）
    queryClient.setQueryData(['inspection', 'execution', executionId], (oldData) => {
      if (!oldData || typeof oldData !== 'object') return oldData
      const execution = oldData as InspectionExecution
      const next: InspectionExecution = {
        ...execution,
        ...(progress !== undefined ? { progress } : {}),
        ...(status ? { status } : {}),
      }
      if (next.progress === execution.progress && next.status === execution.status) return oldData
      return next
    })

    // 同步本地选中执行
    setSelectedExecution((prev) => {
      if (!prev || prev.id !== executionId) return prev
      const next: InspectionExecution = {
        ...prev,
        ...(progress !== undefined ? { progress } : {}),
        ...(status ? { status } : {}),
      }
      if (next.progress === prev.progress && next.status === prev.status) return prev
      return next
    })

    // 执行进入终态时失效统计分析缓存，确保切换 Tab 即可看到最新数据
    if (
      (status === 'completed' || status === 'failed' || status === 'cancelled') &&
      !terminalInvalidatedIdsRef.current.has(executionId)
    ) {
      if (terminalInvalidatedIdsRef.current.size >= 200) {
        terminalInvalidatedIdsRef.current.clear()
      }
      terminalInvalidatedIdsRef.current.add(executionId)
      queryClient.invalidateQueries({ queryKey: ['inspection', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'trends'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'device-distribution'] })
      queryClient.invalidateQueries({ queryKey: ['inspection', 'problem-distribution'] })
    }
  })

  // 判断是否有任何筛选
  const hasDateFilter = useMemo(
    () => !!(filters.startDate || filters.endDate),
    [filters.startDate, filters.endDate]
  )
  const hasAnyFilter = useMemo(
    () => filters.status !== 'all' || hasDateFilter || Boolean(filters.deviceId),
    [filters.status, hasDateFilter, filters.deviceId]
  )

  // 查看详情
  const handleViewDetails = useCallback((execution: InspectionExecution) => {
    setSelectedExecution(execution)
    setShowDetailModal(true)
  }, [])

  // 快捷日期筛选
  const handleQuickDateFilter = useCallback((range: 'today' | 'week' | 'month') => {
    const dateRange = getDateRange(range)
    updateFilter('startDate', dateRange.startDate)
    updateFilter('endDate', dateRange.endDate)
  }, [getDateRange, updateFilter])

  // 清除日期筛选
  const handleClearDateRange = useCallback(() => {
    updateFilter('startDate', '')
    updateFilter('endDate', '')
  }, [updateFilter])

  // 激活筛选芯片列表
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = []
    if (filters.deviceId) {
      chips.push({
        id: 'device',
        label: `设备 #${filters.deviceId}`,
        onRemove: () => updateFilter('deviceId', ''),
      })
    }
    if (filters.status !== 'all') {
      chips.push({
        id: 'status',
        label: formatStatusFilterLabel(filters.status),
        onRemove: () => updateFilter('status', 'all'),
      })
    }
    if (hasDateFilter) {
      const dateLabel = formatDateRangeFilterLabel(filters.startDate, filters.endDate)
      if (dateLabel) {
        chips.push({
          id: 'date',
          label: dateLabel,
          onRemove: handleClearDateRange,
        })
      }
    }
    return chips
  }, [
    filters.deviceId,
    filters.status,
    filters.startDate,
    filters.endDate,
    hasDateFilter,
    updateFilter,
    handleClearDateRange,
  ])

  // 停止执行
  const handleStopExecution = useCallback(async (id: string) => {
    try {
      await stopExecution.mutateAsync(id)
      refetch()
    } catch (error) {
      console.error('Stop execution failed:', error)
    }
  }, [stopExecution, refetch])

  // 生成报告
  const handleGenerateReport = useCallback(async (execution: InspectionExecution) => {
    try {
      await generateReport.mutateAsync({
        executionId: execution.id,
        type: 'summary',
        format: 'pdf',
      })
    } catch (error) {
      console.error('Generate report failed:', error)
    }
  }, [generateReport])

  // 打开删除确认弹窗
  const handleDeleteClick = useCallback((execution: InspectionExecution) => {
    setExecutionToDelete(execution)
    setShowDeleteConfirm(true)
  }, [])

  // 确认删除执行记录
  const handleConfirmDelete = useCallback(async () => {
    if (!executionToDelete) return

    try {
      await deleteExecution.mutateAsync(executionToDelete.id)
      setShowDeleteConfirm(false)
      setExecutionToDelete(null)
      if (selectedExecution?.id === executionToDelete.id) {
        setSelectedExecution(null)
      }
      if (filters.page > 1 && filteredExecutions.length <= 1) {
        updateFilter('page', filters.page - 1)
      }
      refetch()
    } catch (error) {
      console.error('Delete execution failed:', error)
    }
  }, [
    executionToDelete,
    deleteExecution,
    selectedExecution,
    filters.page,
    filteredExecutions.length,
    updateFilter,
    refetch,
  ])

  // 取消删除（删除请求进行中禁止关闭）
  const handleCancelDelete = useCallback(() => {
    if (deleteExecution.isPending) return
    setShowDeleteConfirm(false)
    setExecutionToDelete(null)
  }, [deleteExecution.isPending])

  // 确认批量删除执行记录
  const handleConfirmBatchDelete = useCallback(async () => {
    try {
      if (batchSelection.selectionMode === 'all_filtered') {
        await batchDeleteExecutions.mutateAsync({
          selectAllFiltered: true,
          excludeIds: batchSelection.excludedIds,
          status: filters.status !== 'all' ? filters.status : undefined,
          deviceId: filters.deviceId || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        })
      } else {
        await batchDeleteExecutions.mutateAsync({
          selectAllFiltered: false,
          ids: batchSelection.selectedIds,
        })
      }
      setShowBatchDeleteConfirm(false)
      batchSelection.clearSelection()

      // 如果当前页全部删除了，自动回退上一页
      if (
        filters.page > 1 &&
        (batchSelection.selectionMode === 'all_filtered' ||
          batchSelection.selectedIds.length >= filteredExecutions.length)
      ) {
        updateFilter('page', filters.page - 1)
      }
      refetch()
    } catch (error) {
      console.error('Batch delete executions failed:', error)
    }
  }, [batchSelection, batchDeleteExecutions, filters, updateFilter, filteredExecutions.length, refetch])

  const columns: Column<InspectionExecution>[] = [
    {
      key: 'strategy',
      title: '策略与触发',
      width: '25%',
      render: (_, execution) => {
        const triggerMeta = getTriggerMeta(execution.triggerType)
        return (
          <div className="flex flex-col min-w-0">
            <button
              type="button"
              onClick={() => handleViewDetails(execution)}
              className="text-left font-medium text-foreground hover:text-primary transition-colors cursor-pointer truncate max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            >
              {execution.strategyName}
            </button>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <span className="inline-flex items-center gap-1 shrink-0">
                {triggerMeta.isScheduled ? (
                  <Clock className="w-3 h-3 shrink-0" />
                ) : (
                  <Hand className="w-3 h-3 shrink-0" />
                )}
                {triggerMeta.label}
              </span>
              {execution.triggerUser && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 truncate">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{execution.triggerUser}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'status',
      title: '执行状态',
      width: '12%',
      render: (_, execution) => {
        const statusMeta = getExecutionStatusMeta(execution.status)
        return (
          <Badge variant={statusMeta.badgeVariant} size="sm" className="gap-1">
            {getStatusBadgeIcon(execution.status)}
            {statusMeta.label}
          </Badge>
        )
      },
    },
    {
      key: 'progress',
      title: '覆盖设备 / 进度',
      width: '17%',
      render: (_, execution) => {
        const statusMeta = getExecutionStatusMeta(execution.status)
        const progress = clampProgress(execution.progress)
        return (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-2 max-w-[160px] text-xs">
              <span className="inline-flex items-center gap-1 text-foreground tabular-nums">
                <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {execution.completedDevices}/{execution.totalDevices} 台
              </span>
              <span className="tabular-nums text-muted-foreground">{progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full max-w-[160px] rounded-full bg-surface-3 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-300', statusMeta.progressBarClass)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      key: 'result',
      title: '巡检结果',
      width: '19%',
      render: (_, execution) => {
        const summary = normalizeExecutionSummary(execution.summary)
        const scoreMeta = getExecutionScoreMeta(
          summary.score,
          execution.status,
          summary.totalChecks
        )
        return (
          <div className="flex flex-col">
            <div className={cn('text-base font-bold tabular-nums leading-tight', scoreMeta.colorClass)}>
              {scoreMeta.display}
            </div>
            {!scoreMeta.hasScore ? (
              <span className="mt-0.5 text-xs text-muted-foreground">检查进行中…</span>
            ) : (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                <span>通过 {summary.passedChecks}/{summary.totalChecks}</span>
                {summary.warningChecks > 0 && (
                  <span className="font-medium text-warning">警告 {summary.warningChecks}</span>
                )}
                {summary.failedChecks > 0 && (
                  <span className="font-medium text-danger">失败 {summary.failedChecks}</span>
                )}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'timing',
      title: '执行时间',
      width: '15%',
      render: (_, execution) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium tabular-nums text-foreground whitespace-nowrap">
            {formatDateYMD(execution.startTime)} {formatTimeHMS(execution.startTime)}
          </span>
          <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {execution.status === 'running'
              ? '进行中'
              : `耗时 ${formatExecutionDuration(execution.duration)}`}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      width: '12%',
      render: (_, execution) => {
        const canDelete = execution.status !== 'running'
        return (
          <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleViewDetails(execution)}
              title="查看详情"
              aria-label="查看详情"
              className="cursor-pointer"
            >
              <Eye className="w-4 h-4" />
            </Button>
            {execution.status === 'running' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleStopExecution(execution.id)}
                disabled={stopExecution.isPending}
                title="停止执行"
                aria-label="停止执行"
                className="cursor-pointer"
              >
                <Square className="w-4 h-4 text-danger" />
              </Button>
            )}
            {execution.status === 'completed' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleGenerateReport(execution)}
                disabled={generateReport.isPending}
                title="生成报告"
                aria-label="生成报告"
                className="cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {canDelete && (
              <DeleteIconButton
                onClick={() => handleDeleteClick(execution)}
                disabled={deleteExecution.isPending}
                title="删除记录"
                className="cursor-pointer"
              />
            )}
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return <ExecutionTableSkeleton rows={5} />
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-danger-soft text-danger-soft-foreground flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">加载失败</h3>
              <p className="text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button onClick={() => refetch()} className="cursor-pointer">
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const deleteStatusMeta = executionToDelete ? getExecutionStatusMeta(executionToDelete.status) : null
  const deleteSummary = executionToDelete ? normalizeExecutionSummary(executionToDelete.summary) : null
  const deleteScoreMeta = executionToDelete && deleteSummary
    ? getExecutionScoreMeta(
        deleteSummary.score,
        executionToDelete.status,
        deleteSummary.totalChecks
      )
    : null

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <CompactPageToolbar
          layout="between"
          testIdPrefix="inspection-executions-toolbar"
          filters={(
            <ExecutionFilters
              statusFilter={filters.status}
              startDate={filters.startDate}
              endDate={filters.endDate}
              onStatusChange={(status) => updateFilter('status', status)}
              onStartDateChange={(date) => updateFilter('startDate', date)}
              onEndDateChange={(date) => updateFilter('endDate', date)}
              onClearDateRange={handleClearDateRange}
              onQuickDateFilter={handleQuickDateFilter}
              onRefresh={refetch}
              isFetching={isFetching}
              hasRunningExecutions={hasRunningExecutions}
              showRefresh={false}
            />
          )}
          secondaryActions={[
            {
              key: 'refresh-executions',
              label: isFetching ? '刷新中…' : '刷新',
              icon: hasRunningExecutions ? (
                <div className="relative">
                  <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-success animate-pulse" />
                </div>
              ) : (
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              ),
              variant: 'outline',
              disabled: isFetching,
              onClick: () => {
                void refetch()
              },
            },
          ]}
        />

        {/* 一体式主数据面板：按需顶栏（激活筛选 / 运行同步状态）+ 表格 + 吸底分页 */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          {(activeFilterChips.length > 0 || hasRunningExecutions) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/40 px-4 py-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`移除 ${chip.label} 筛选`}
                    className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span>{chip.label}</span>
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
                {activeFilterChips.length > 1 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="cursor-pointer text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
                  >
                    重置筛选
                  </button>
                )}
              </div>

              {hasRunningExecutions && (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-info-soft-foreground">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="tabular-nums">{runningCount} 个任务执行中 · 自动同步</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-1 min-h-0 flex-col">
            {filteredExecutions.length > 0 ? (
              <Table
                data={filteredExecutions}
                columns={columns}
                rowKey="id"
                rowSelection={batchSelection.rowSelection}
                className="flex flex-1 min-h-0 flex-col border-0"
              />
            ) : (
              <ExecutionEmptyState
                embedded
                hasFilters={hasAnyFilter}
                onClearFilters={resetFilters}
                onRefresh={refetch}
              />
            )}
          </div>

          {/* 吸底分页栏 */}
          <div data-slot="table-footer" className="shrink-0 border-t border-border px-4">
            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={filters.pageSize}
              onPageChange={(page) => updateFilter('page', page)}
              onPageSizeChange={(pageSize) => {
                // 切换每页条数后回到第 1 页，与全站行为保持一致
                updateFilters({ page: 1, pageSize })
              }}
            />
          </div>
        </div>
      </div>

      {/* 执行详情弹窗 */}
      <ExecutionDetailModal
        open={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        execution={selectedExecution}
      />

      {/* 删除确认弹窗 */}
      <SimpleModal
        open={showDeleteConfirm}
        onClose={handleCancelDelete}
        size="sm"
        ariaLabel="确认删除执行记录"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-danger-soft text-danger-soft-foreground">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              确认删除执行记录
            </h3>
          </div>

          {executionToDelete && deleteStatusMeta && deleteScoreMeta && (
            <div className="mb-5 p-4 rounded-lg border border-border bg-surface-2/60">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">策略名称</span>
                  <span className="font-medium text-foreground truncate">
                    {executionToDelete.strategyName}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">执行时间</span>
                  <span className="text-foreground tabular-nums">
                    {formatDateTimeYMDHMS(executionToDelete.startTime)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="text-muted-foreground">执行状态</span>
                  <Badge variant={deleteStatusMeta.badgeVariant} size="sm">
                    {deleteStatusMeta.label}
                  </Badge>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">巡检评分</span>
                  <span className={cn('font-bold tabular-nums', deleteScoreMeta.colorClass)}>
                    {deleteScoreMeta.display}
                  </span>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground mb-6">
            删除后将无法恢复此执行记录及其相关的巡检结果数据。确定要继续吗？
          </p>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deleteExecution.isPending}
              className="cursor-pointer"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteExecution.isPending}
              className="cursor-pointer"
            >
              {deleteExecution.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  确认删除
                </>
              )}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* 底部悬浮批量操作栏 */}
      <FloatingBatchActionBar
        selectedCount={batchSelection.selectedCount}
        selectionMode={batchSelection.selectionMode}
        totalCount={totalItems}
        isAllCurrentPageSelected={batchSelection.isAllCurrentPageSelected}
        onSelectCurrentPage={batchSelection.selectCurrentPage}
        onSelectAllFiltered={batchSelection.selectAllFiltered}
        onInvertCurrentPage={batchSelection.invertCurrentPage}
        onClearSelection={batchSelection.clearSelection}
        onDelete={() => setShowBatchDeleteConfirm(true)}
        isDeleting={batchDeleteExecutions.isPending}
      />

      {/* 批量删除确认弹窗 */}
      <BatchDeleteConfirmModal
        isOpen={showBatchDeleteConfirm}
        onClose={() => {
          if (!batchDeleteExecutions.isPending) {
            setShowBatchDeleteConfirm(false)
          }
        }}
        onConfirm={handleConfirmBatchDelete}
        isDeleting={batchDeleteExecutions.isPending}
        count={batchSelection.selectedCount}
        isAllFiltered={batchSelection.selectionMode === 'all_filtered'}
      />
    </>
  )
}
