import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import {
  Square,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  User,
  Eye,
  Download,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Pagination
} from '@/components/atoms'
import { CompactPageToolbar } from '@/components/shared'
import { SimpleModal } from '@/components/atoms/modal'
import {
  useInspectionExecutions,
  useStopExecution,
  useGenerateReport,
  useDeleteExecution
} from '../hooks/useInspection'
import { useURLFilters } from '../hooks/useURLFilters'
import { useDateFilters } from '../hooks/useDateFilters'
import { InspectionExecution } from '../types'
import { ExecutionDetailModal } from './ExecutionDetailModal'
import { ExecutionStatsCards } from './ExecutionStatsCards'
import { ExecutionFilters } from './ExecutionFilters'
import { ExecutionTableSkeleton } from './ExecutionTableSkeleton'
import { ExecutionEmptyState } from './ExecutionEmptyState'
import { useWebSocketEvent, WebSocketEvents, wsManager } from '@/lib/websocket'

// 自动刷新间隔（毫秒）- 当有执行中的任务时
const AUTO_REFRESH_INTERVAL = 10000

export const InspectionExecutions: React.FC = () => {
  const queryClient = useQueryClient()

  // 使用URL筛选hooks
  const { filters, updateFilter, resetFilters } = useURLFilters()
  const { getDateRange } = useDateFilters()

  // 本地状态
  const [selectedExecution, setSelectedExecution] = useState<InspectionExecution | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [executionToDelete, setExecutionToDelete] = useState<InspectionExecution | null>(null)

  const { data: executionsData, isLoading, refetch, isFetching, error } = useInspectionExecutions({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status !== 'all' ? filters.status : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined
  })
  const stopExecution = useStopExecution()
  const generateReport = useGenerateReport()
  const deleteExecution = useDeleteExecution()

  const executions: InspectionExecution[] = useMemo(
    () => executionsData?.items ?? [],
    [executionsData?.items]
  )

  const totalPages = executionsData?.pages || 1
  const totalItems = executionsData?.total || 0

  // 检查是否有执行中的任务
  const hasRunningExecutions = useMemo(
    () => executions.some(e => e.status === 'running'),
    [executions]
  )

  // 显示所有执行记录
  const filteredExecutions = useMemo(
    () => executions,
    [executions]
  )

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

    // 同步本地选中执行（顶部“已选择执行”提示条）
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
  })

  // 判断是否有任何筛选
  const hasDateFilter = useMemo(
    () => !!(filters.startDate || filters.endDate),
    [filters.startDate, filters.endDate]
  )
  const hasAnyFilter = useMemo(
    () => filters.status !== 'all' || hasDateFilter,
    [filters.status, hasDateFilter]
  )

  // 查看详情 - 使用 useCallback 优化
  const handleViewDetails = useCallback((execution: InspectionExecution) => {
    setSelectedExecution(execution)
    setShowDetailModal(true)
  }, [])

  // 快捷日期筛选 - 使用 useCallback 优化
  const handleQuickDateFilter = useCallback((range: 'today' | 'week' | 'month') => {
    const dateRange = getDateRange(range)
    updateFilter('startDate', dateRange.startDate)
    updateFilter('endDate', dateRange.endDate)
  }, [getDateRange, updateFilter])

  // 清除日期筛选 - 使用 useCallback 优化
  const handleClearDateRange = useCallback(() => {
    updateFilter('startDate', '')
    updateFilter('endDate', '')
  }, [updateFilter])

  // 停止执行 - 使用 useCallback 优化
  const handleStopExecution = useCallback(async (id: string) => {
    try {
      await stopExecution.mutateAsync(id)
      // 停止后刷新列表
      refetch()
    } catch (error) {
      console.error('Stop execution failed:', error)
    }
  }, [stopExecution, refetch])

  // 生成报告 - 使用 useCallback 优化
  const handleGenerateReport = useCallback(async (execution: InspectionExecution) => {
    try {
      await generateReport.mutateAsync({
        executionId: execution.id,
        type: 'summary',
        format: 'pdf'
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
      // 如果删除的是当前选中的记录，清除选中状态
      if (selectedExecution?.id === executionToDelete.id) {
        setSelectedExecution(null)
      }
      refetch()
    } catch (error) {
      console.error('Delete execution failed:', error)
    }
  }, [executionToDelete, deleteExecution, selectedExecution, refetch])

  // 取消删除
  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
    setExecutionToDelete(null)
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'cancelled':
        return <Square className="w-4 h-4 text-gray-500" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="info">执行中</Badge>
      case 'completed':
        return <Badge variant="success">已完成</Badge>
      case 'failed':
        return <Badge variant="error">失败</Badge>
      case 'cancelled':
        return <Badge variant="secondary">已取消</Badge>
      default:
        return <Badge variant="warning">等待中</Badge>
    }
  }

  const getTriggerTypeBadge = (type: string) => {
    return type === 'scheduled' ? (
      <Badge variant="outline">定时触发</Badge>
    ) : (
      <Badge variant="secondary">手动触发</Badge>
    )
  }

  const formatDuration = (duration: number | undefined) => {
    if (!duration) return '-'
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    return `${minutes}分${seconds}秒`
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const columns: Column<InspectionExecution>[] = [
    {
      key: 'strategy',
      title: '策略信息',
      render: (_, execution) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{execution.strategyName}</span>
          <div className="flex items-center gap-2 mt-1">
            {getTriggerTypeBadge(execution.triggerType)}
            {execution.triggerUser && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <User className="w-3 h-3" />
                {execution.triggerUser}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      title: '执行状态',
      render: (_, execution) => (
        <div className="flex items-center gap-2">
          {getStatusIcon(execution.status)}
          {getStatusBadge(execution.status)}
        </div>
      )
    },
    {
      key: 'progress',
      title: '进度',
      render: (_, execution) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${execution.progress}%` }}
              />
            </div>
            <span className="text-sm font-medium">{execution.progress}%</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {execution.completedDevices}/{execution.totalDevices} 设备
          </div>
        </div>
      )
    },
    {
      key: 'result',
      title: '巡检结果',
      render: (_, execution) => (
        <div className="flex flex-col">
          <div className={`text-lg font-bold ${getScoreColor(execution.summary.score)}`}>
            {execution.summary.score.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            通过: {execution.summary.passedChecks}/{execution.summary.totalChecks}
          </div>
        </div>
      )
    },
    {
      key: 'timing',
      title: '执行时间',
      render: (_, execution) => (
        <div className="flex flex-col text-sm">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            {new Date(execution.startTime).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(execution.startTime).toLocaleTimeString()}
          </div>
          {execution.duration && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              耗时: {formatDuration(execution.duration)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, execution) => {
        const canDelete = execution.status !== 'running'
        return (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleViewDetails(execution)}
              title="查看详情"
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
              >
                <Square className="w-4 h-4 text-red-500" />
              </Button>
            )}
            {execution.status === 'completed' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleGenerateReport(execution)}
                disabled={generateReport.isPending}
                title="生成报告"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteClick(execution)}
                disabled={deleteExecution.isPending}
                title="删除记录"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )
      }
    }
  ]

  if (isLoading) {
    return <ExecutionTableSkeleton rows={5} />
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-foreground">加载失败</h3>
              <p className="text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <CompactPageToolbar
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
              onClearAllFilters={resetFilters}
              onQuickDateFilter={handleQuickDateFilter}
              hasDateFilter={hasDateFilter}
              hasAnyFilter={hasAnyFilter}
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
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
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

        {selectedExecution && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">已选择执行</span>
              {getStatusBadge(selectedExecution.status)}
            </div>
            <div className="text-muted-foreground">
              {selectedExecution.strategyName}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(selectedExecution.startTime).toLocaleString()}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              完成进度：{selectedExecution.progress}% ({selectedExecution.completedDevices}/{selectedExecution.totalDevices})
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedExecution(null)}>
              清除
            </Button>
          </div>
        )}

        {/* 执行统计 */}
        <ExecutionStatsCards executions={executions} />

        {/* 执行记录列表 */}
        {filteredExecutions.length > 0 ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Table
                data={filteredExecutions}
                columns={columns}
                className="bg-card rounded-lg shadow-sm"
              />
            </motion.div>

            {/* 分页组件 */}
            {totalPages > 1 && (
              <Card>
                <CardContent className="p-4">
                  <Pagination
                    currentPage={filters.page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={filters.pageSize}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPageChange={(page) => updateFilter('page', page)}
                    onPageSizeChange={(pageSize) => updateFilter('pageSize', pageSize)}
                    showPageSizeSelector={true}
                  />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <ExecutionEmptyState
            hasFilters={hasAnyFilter}
            onClearFilters={resetFilters}
            onRefresh={refetch}
          />
        )}
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
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              确认删除执行记录
            </h3>
          </div>
          
          {executionToDelete && (
            <div className="mb-6 p-4 bg-muted/40 rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">策略名称:</span>
                  <span className="font-medium text-foreground">
                    {executionToDelete.strategyName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">执行时间:</span>
                  <span className="text-muted-foreground">
                    {new Date(executionToDelete.startTime).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">执行状态:</span>
                  {getStatusBadge(executionToDelete.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">巡检评分:</span>
                  <span className={`font-bold ${getScoreColor(executionToDelete.summary.score)}`}>
                    {executionToDelete.summary.score.toFixed(1)}
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
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteExecution.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
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
    </>
  )
}
