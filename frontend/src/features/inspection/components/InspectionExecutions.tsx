import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Square,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  User,
  Eye,
  Download
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
import {
  useInspectionExecutions,
  useStopExecution,
  useGenerateReport
} from '../hooks/useInspection'
import { useURLFilters } from '../hooks/useURLFilters'
import { useDateFilters } from '../hooks/useDateFilters'
import { InspectionExecution } from '../types'
import { ExecutionDetailModal } from './ExecutionDetailModal'
import { ExecutionStatsCards } from './ExecutionStatsCards'
import { ExecutionFilters } from './ExecutionFilters'
import { ExecutionTableSkeleton } from './ExecutionTableSkeleton'
import { ExecutionEmptyState } from './ExecutionEmptyState'

export const InspectionExecutions: React.FC = () => {
  // 使用URL筛选hooks
  const { filters, updateFilter, resetFilters } = useURLFilters()
  const { getDateRange } = useDateFilters()

  // 本地状态
  const [selectedExecution, setSelectedExecution] = useState<InspectionExecution | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const { data: executionsData, isLoading, refetch } = useInspectionExecutions({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status !== 'all' ? filters.status : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined
  })
  const stopExecution = useStopExecution()
  const generateReport = useGenerateReport()

  const executions: InspectionExecution[] = useMemo(
    () => executionsData?.items ?? [],
    [executionsData?.items]
  )

  const totalPages = executionsData?.pages || 1
  const totalItems = executionsData?.total || 0

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

  // 判断是否有任何筛选
  const hasDateFilter = useMemo(
    () => !!(filters.startDate || filters.endDate),
    [filters.startDate, filters.endDate]
  )
  const hasAnyFilter = useMemo(
    () => filters.status !== 'all' || hasDateFilter,
    [filters.status, hasDateFilter]
  )

  // 查看详情
  const handleViewDetails = (execution: InspectionExecution) => {
    setSelectedExecution(execution)
    setShowDetailModal(true)
  }

  // 快捷日期筛选
  const handleQuickDateFilter = (range: 'today' | 'week' | 'month') => {
    const dateRange = getDateRange(range)
    updateFilter('startDate', dateRange.startDate)
    updateFilter('endDate', dateRange.endDate)
  }

  // 清除日期筛选
  const handleClearDateRange = () => {
    updateFilter('startDate', '')
    updateFilter('endDate', '')
  }

  // 停止执行
  const handleStopExecution = async (id: string) => {
    try {
      await stopExecution.mutateAsync(id)
    } catch (error) {
      console.error('Stop execution failed:', error)
    }
  }

  // 生成报告
  const handleGenerateReport = async (execution: InspectionExecution) => {
    try {
      await generateReport.mutateAsync({
        executionId: execution.id,
        type: 'summary',
        format: 'pdf'
      })
    } catch (error) {
      console.error('Generate report failed:', error)
    }
  }

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
          <span className="font-medium text-gray-900 dark:text-gray-100">{execution.strategyName}</span>
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
          </div>
        )
      }
    }
  ]

  if (isLoading) {
    return <ExecutionTableSkeleton rows={5} />
  }

  return (
    <>
      <div className="space-y-4">
        {/* 操作栏 */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div></div>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
          </div>

          {/* 筛选器栏 */}
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
          />
        </div>

        {selectedExecution && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">已选择执行</span>
              {getStatusBadge(selectedExecution.status)}
            </div>
            <div className="text-gray-700 dark:text-gray-300">
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
                className="bg-white dark:bg-gray-900 rounded-lg shadow-sm"
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
    </>
  )
}