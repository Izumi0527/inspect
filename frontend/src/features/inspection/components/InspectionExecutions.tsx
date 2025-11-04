import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Square, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Eye,
  Download,
  RefreshCw,
  Calendar,
  User
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/atoms'
import { 
  useInspectionExecutions,
  useStopExecution,
  useGenerateReport
} from '../hooks/useInspection'
import { InspectionExecution } from '../types'

interface Props {
  searchText: string
}

export const InspectionExecutions: React.FC<Props> = ({ searchText }) => {
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedExecution, setSelectedExecution] = useState<InspectionExecution | null>(null)
  
  const { data: executionsData, isLoading, refetch } = useInspectionExecutions({
    status: statusFilter !== 'all' ? statusFilter : undefined
  })
  const stopExecution = useStopExecution()
  const generateReport = useGenerateReport()

  const executions: InspectionExecution[] = useMemo(
    () => executionsData?.items ?? [],
    [executionsData?.items]
  )

  // 过滤执行记录
  const filteredExecutions = executions.filter(execution => 
    execution.strategyName.toLowerCase().includes(searchText.toLowerCase())
  )

  useEffect(() => {
    if (selectedExecution && !executions.some(execution => execution.id === selectedExecution.id)) {
      setSelectedExecution(null)
    }
  }, [executions, selectedExecution])

  const handleStopExecution = async (id: string) => {
    try {
      await stopExecution.mutateAsync(id)
    } catch (error) {
      console.error('Stop execution failed:', error)
    }
  }

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
          <span className="font-medium text-gray-900">{execution.strategyName}</span>
          <div className="flex items-center gap-2 mt-1">
            {getTriggerTypeBadge(execution.triggerType)}
            {execution.triggerUser && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
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
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${execution.progress}%` }}
              />
            </div>
            <span className="text-sm font-medium">{execution.progress}%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
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
          <div className="text-xs text-gray-500">
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
            <Calendar className="w-3 h-3 text-gray-400" />
            {new Date(execution.startTime).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" />
            {new Date(execution.startTime).toLocaleTimeString()}
          </div>
          {execution.duration && (
            <div className="text-xs text-gray-500 mt-1">
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
        const isSelected = selectedExecution?.id === execution.id

        return (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={isSelected ? 'secondary' : 'ghost'}
              onClick={() => setSelectedExecution(isSelected ? null : execution)}
              title="查看详情"
              aria-pressed={isSelected}
            >
              <Eye className={isSelected ? 'w-4 h-4 text-blue-500' : 'w-4 h-4'} />
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
    return (
      <div className="space-y-4">
        {/* 加载骨架屏 */}
        {[...Array(5)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">执行历史记录</h3>
          <Badge variant="secondary">{filteredExecutions.length} 项</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="running">执行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>
      </div>

      {selectedExecution && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">已选择执行</span>
            {getStatusBadge(selectedExecution.status)}
          </div>
          <div className="text-gray-700">
            {selectedExecution.strategyName}
          </div>
          <div className="text-xs text-gray-400">
            {new Date(selectedExecution.startTime).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">
            完成进度：{selectedExecution.progress}% ({selectedExecution.completedDevices}/{selectedExecution.totalDevices})
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedExecution(null)}>
            清除
          </Button>
        </div>
      )}

      {/* 执行统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: '总执行数', count: executions.length, color: 'blue' },
          { label: '执行中', count: executions.filter(e => e.status === 'running').length, color: 'blue' },
          { label: '已完成', count: executions.filter(e => e.status === 'completed').length, color: 'green' },
          { label: '失败', count: executions.filter(e => e.status === 'failed').length, color: 'red' },
          { label: '平均评分', count: executions.length > 0 ? 
            (executions.reduce((sum, e) => sum + e.summary.score, 0) / executions.length).toFixed(1) : '0', 
            color: 'purple' }
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold text-${item.color}-600`}>{item.count}</div>
              <div className="text-sm text-gray-600">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 执行记录列表 */}
      {filteredExecutions.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table
            data={filteredExecutions}
            columns={columns}
            className="bg-white rounded-lg shadow-sm"
          />
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-gray-400" />
              <div>
                <h3 className="text-lg font-medium text-gray-900">暂无执行记录</h3>
                <p className="text-gray-500 mt-1">
                  {searchText ? '没有找到匹配的执行记录' : '还没有执行过巡检任务'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}