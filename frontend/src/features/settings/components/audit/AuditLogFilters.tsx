import React from 'react'
import { X } from 'lucide-react'
import { Badge, Button, SmartDateRangePicker } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AuditAction } from '../../types/audit.types'
import { actionLabels } from './audit.constants'

interface Props {
  actionFilter: AuditAction | ''
  statusFilter: 'success' | 'failed' | ''
  startDate: string
  endDate: string
  hasDateFilter: boolean
  hasAnyFilter: boolean
  onActionChange: (action: AuditAction | '') => void
  onStatusChange: (status: 'success' | 'failed' | '') => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClearDateRange: () => void
  onClearAllFilters: () => void
  onQuickDateFilter: (range: 'today' | 'week' | 'month') => void
}

export const AuditLogFilters: React.FC<Props> = React.memo((props) => {
  const {
    actionFilter,
    statusFilter,
    startDate,
    endDate,
    hasDateFilter,
    hasAnyFilter,
    onActionChange,
    onStatusChange,
    onStartDateChange,
    onEndDateChange,
    onClearDateRange,
    onClearAllFilters,
    onQuickDateFilter,
  } = props

  const filterCount =
    (actionFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (hasDateFilter ? 1 : 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={actionFilter || '_all'}
        onValueChange={(value) =>
          onActionChange(value === '_all' ? '' : (value as AuditAction))
        }
      >
        <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="筛选操作类型">
          <SelectValue placeholder="操作类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">全部操作</SelectItem>
          {Object.entries(actionLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={statusFilter || '_all'}
        onValueChange={(value) =>
          onStatusChange(value === '_all' ? '' : (value as 'success' | 'failed'))
        }
      >
        <SelectTrigger className="h-9 w-[100px] text-sm" aria-label="筛选状态">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">全部状态</SelectItem>
          <SelectItem value="success">成功</SelectItem>
          <SelectItem value="failed">失败</SelectItem>
        </SelectContent>
      </Select>

      <SmartDateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onClear={onClearDateRange}
        onQuickSelect={onQuickDateFilter}
        placeholder="选择日期范围"
      />

      {hasAnyFilter && (
        <>
          <Badge variant="secondary" className="px-2 py-1 text-xs">
            已应用 {filterCount} 个筛选
          </Badge>
          <Button variant="outline" size="sm" onClick={onClearAllFilters} className="h-9">
            <X className="w-4 h-4 mr-1" />
            清除筛选
          </Button>
        </>
      )}
    </div>
  )
})

AuditLogFilters.displayName = 'AuditLogFilters'
