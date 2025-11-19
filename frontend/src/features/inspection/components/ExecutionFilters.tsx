import React from 'react'
import { Calendar, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  Badge
} from '@/components/atoms'
import { Input } from '@/components/atoms/input'

/**
 * 执行记录筛选器栏组件
 *
 * 包含的筛选功能：
 * - 状态筛选（全部/执行中/已完成/失败/已取消）
 * - 日期范围筛选
 * - 快捷日期筛选（今天/本周/本月）
 * - 清除筛选按钮
 * - 筛选状态指示器
 */

interface Props {
  // 筛选值
  statusFilter: string
  startDate: string
  endDate: string

  // 更新函数
  onStatusChange: (status: string) => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClearDateRange: () => void
  onClearAllFilters: () => void
  onQuickDateFilter: (range: 'today' | 'week' | 'month') => void

  // 状态标志
  hasDateFilter: boolean
  hasAnyFilter: boolean
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
    hasAnyFilter
  } = props

  // 计算筛选条件数量
  const filterCount =
    (statusFilter !== 'all' ? 1 : 0) + (hasDateFilter ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* 主筛选行 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 状态筛选 */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
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

        {/* 日期范围筛选 */}
        <div className="flex items-center gap-2">
          {/* 开始日期 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">开始日期:</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-8 w-40 text-sm border-0 p-0 focus:ring-0"
              max={endDate || undefined}
            />
          </div>

          <span className="text-gray-400 dark:text-gray-500">-</span>

          {/* 结束日期 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">结束日期:</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="h-8 w-40 text-sm border-0 p-0 focus:ring-0"
              min={startDate || undefined}
            />
          </div>

          {/* 清除日期筛选 */}
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearDateRange}
              className="h-8"
              title="清除日期筛选"
            >
              <X className="w-4 h-4 mr-1" />
              清除日期
            </Button>
          )}
        </div>

        {/* 清除所有筛选 */}
        {hasAnyFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAllFilters}
            className="ml-auto"
            title="清除所有筛选条件"
          >
            <X className="w-4 h-4 mr-1" />
            清除筛选
          </Button>
        )}
      </div>

      {/* 快捷日期筛选行 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">快速筛选:</span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onQuickDateFilter('today')}
            className="h-8 text-sm"
          >
            今天
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onQuickDateFilter('week')}
            className="h-8 text-sm"
          >
            本周
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onQuickDateFilter('month')}
            className="h-8 text-sm"
          >
            本月
          </Button>
        </div>

        {/* 筛选状态指示器 */}
        {hasAnyFilter && (
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Badge variant="secondary" className="px-2 py-1">
              已应用 {filterCount} 个筛选条件
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
})
