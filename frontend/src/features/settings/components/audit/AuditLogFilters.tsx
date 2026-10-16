import React from 'react'
import { Button, SmartDateRangePicker } from '@/components/atoms'
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
  onActionChange: (action: AuditAction | '') => void
  onStatusChange: (status: 'success' | 'failed' | '') => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClearDateRange: () => void
  onQuickDateFilter: (range: 'today' | 'week' | 'month') => void
}

export const AuditLogFilters: React.FC<Props> = React.memo((props) => {
  const {
    actionFilter,
    statusFilter,
    startDate,
    endDate,
    onActionChange,
    onStatusChange,
    onStartDateChange,
    onEndDateChange,
    onClearDateRange,
    onQuickDateFilter,
  } = props

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={actionFilter || '_all'}
        onValueChange={(value) =>
          onActionChange(value === '_all' ? '' : (value as AuditAction))
        }
      >
        <SelectTrigger className="h-9 w-auto gap-2 text-sm" aria-label="筛选操作类型">
          <SelectValue placeholder="操作类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">操作</SelectItem>
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
        <SelectTrigger className="h-9 w-auto gap-2 text-sm" aria-label="筛选状态">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">状态</SelectItem>
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
        placeholder="日期"
      />

    </div>
  )
})

AuditLogFilters.displayName = 'AuditLogFilters'
