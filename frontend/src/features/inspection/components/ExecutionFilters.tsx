import React from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Button,
  SmartDateRangePicker,
} from '@/components/atoms'
import { cn } from '@/utils/cn'
import { EXECUTION_STATUS_OPTIONS } from '../utils/executionPresentation'

/**
 * 执行记录筛选器栏组件
 *
 * 包含的筛选功能：
 * - 状态内联分段筛选（全部/执行中/已完成/失败/已取消）
 * - 智能日期范围筛选（快速预设 + 自定义输入）
 * - 可选刷新按钮（独立调用场景）
 */

interface Props {
  statusFilter: string
  startDate: string
  endDate: string

  onStatusChange: (status: string) => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClearDateRange: () => void
  onQuickDateFilter: (range: 'today' | 'week' | 'month') => void

  // 刷新
  onRefresh: () => void
  isFetching: boolean
  hasRunningExecutions: boolean
  showRefresh?: boolean
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
    onQuickDateFilter,
    onRefresh,
    isFetching,
    hasRunningExecutions,
    showRefresh = true,
  } = props

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 状态内联分段器 */}
      <div
        role="group"
        aria-label="执行状态筛选"
        className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface-2 p-[3px]"
      >
        {EXECUTION_STATUS_OPTIONS.map((option) => {
          const isActive = statusFilter === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onStatusChange(option.value)}
              className={cn(
                'inline-flex h-7 items-center cursor-pointer rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                isActive
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {/* 智能日期范围选择器 */}
      <SmartDateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onClear={onClearDateRange}
        onQuickSelect={onQuickDateFilter}
        placeholder="日期范围"
      />

      {/* 刷新按钮（ml-auto 推到最右侧）*/}
      {showRefresh && (
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isFetching}
          className="ml-auto h-9 relative cursor-pointer"
          title={hasRunningExecutions ? '有任务执行中，自动刷新已启用' : '刷新列表'}
        >
          {hasRunningExecutions && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-success animate-pulse" />
          )}
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? '刷新中…' : '刷新'}
        </Button>
      )}
    </div>
  )
})

ExecutionFilters.displayName = 'ExecutionFilters'
