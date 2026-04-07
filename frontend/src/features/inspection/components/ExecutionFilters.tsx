import React from 'react'
import { RefreshCw, X } from 'lucide-react'
import {
  Button,
  Badge,
  SmartDateRangePicker
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

/**
 * 执行记录筛选器栏组件
 *
 * 包含的筛选功能：
 * - 状态筛选（全部/执行中/已完成/失败/已取消）
 * - 智能日期范围筛选（快速预设 + 自定义输入）
 * - 清除所有筛选按钮
 * - 筛选状态指示器
 * - 刷新按钮（与筛选器同行）
 */

interface Props {
  statusFilter: string
  startDate: string
  endDate: string

  onStatusChange: (status: string) => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClearDateRange: () => void
  onClearAllFilters: () => void
  onQuickDateFilter: (range: 'today' | 'week' | 'month') => void

  hasDateFilter: boolean
  hasAnyFilter: boolean

  // 刷新
  onRefresh: () => void
  isFetching: boolean
  hasRunningExecutions: boolean
}

export const ExecutionFilters: React.FC<Props> = React.memo((props) => {
  const {
    statusFilter,
    startDate,
    endDate,
    onStatusChange,
    onStartDateChange,
    onEndDateChange,
    onClearDateRange,
    onClearAllFilters,
    onQuickDateFilter,
    hasDateFilter,
    hasAnyFilter,
    onRefresh,
    isFetching,
    hasRunningExecutions,
  } = props

  const filterCount =
    (statusFilter !== 'all' ? 1 : 0) + (hasDateFilter ? 1 : 0)

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 状态筛选 */}
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-32 h-9 text-sm rounded-lg px-3 border-border bg-card" aria-label="执行状态筛选">
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

      {/* 智能日期范围选择器 */}
      <SmartDateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onClear={onClearDateRange}
        onQuickSelect={onQuickDateFilter}
        placeholder="选择日期范围"
      />

      {/* 筛选状态徽章 + 清除 */}
      {hasAnyFilter && (
        <>
          <Badge variant="secondary" className="px-2 py-1 text-xs">
            已应用 {filterCount} 个筛选
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAllFilters}
            className="h-9"
            title="清除所有筛选条件"
          >
            <X className="w-4 h-4 mr-1" />
            清除筛选
          </Button>
        </>
      )}

      {/* 刷新按钮（ml-auto 推到最右侧）*/}
      <Button
        variant="outline"
        onClick={onRefresh}
        disabled={isFetching}
        className="ml-auto relative"
        title={hasRunningExecutions ? '有任务执行中，自动刷新已启用' : '刷新列表'}
      >
        {hasRunningExecutions && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        )}
        <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
        {isFetching ? '刷新中…' : '刷新'}
      </Button>
    </div>
  )
})
