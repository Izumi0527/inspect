/**
 * 日志过滤器栏
 */
import React from 'react'
import { Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { LogFilters, LogLevel, LogFacility, LogSource } from '../types'
import { LOG_LEVEL_CONFIG, LOG_FACILITY_CONFIG, LOG_SOURCE_CONFIG } from '../types'

interface LogFiltersBarProps {
  filters: LogFilters
  onFilterChange: <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => void
  selectedCount?: number
  renderAsToolbar?: boolean
}

export const LogFiltersBar: React.FC<LogFiltersBarProps> = ({
  filters,
  onFilterChange,
  selectedCount = 0,
  renderAsToolbar = false,
}) => {
  return (
    <div className={renderAsToolbar ? '' : 'mb-4 space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 搜索框 */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            placeholder="搜索日志内容..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            className="h-9 pl-10 text-sm"
          />
        </div>

        {/* 日志级别过滤 */}
        <Select
          value={filters.levelFilter}
          onValueChange={(value) => onFilterChange('levelFilter', value as LogLevel | 'all')}
        >
          <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="日志级别筛选">
            <SelectValue placeholder="日志级别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            {Object.entries(LOG_LEVEL_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <span className={config.color}>{config.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 设施类型过滤 */}
        <Select
          value={filters.facilityFilter}
          onValueChange={(value) => onFilterChange('facilityFilter', value as LogFacility | 'all')}
        >
          <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="设施类型筛选">
            <SelectValue placeholder="设施类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部设施</SelectItem>
            {Object.entries(LOG_FACILITY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 来源过滤 */}
        <Select
          value={filters.sourceFilter}
          onValueChange={(value) => onFilterChange('sourceFilter', value as LogSource | 'all')}
        >
          <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="日志来源筛选">
            <SelectValue placeholder="日志来源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            {Object.entries(LOG_SOURCE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {renderAsToolbar && selectedCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
            已选择 {selectedCount} 条日志
          </span>
        )}
      </div>

      {/* 选中状态提示 */}
      {!renderAsToolbar && selectedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <Filter className="h-4 w-4" />
          <span>已选择 {selectedCount} 条日志</span>
        </div>
      )}
    </div>
  )
}
