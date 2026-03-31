/**
 * 日志过滤器栏
 */
import React from 'react'
import { Search, Filter, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  onReset: () => void
  selectedCount?: number
}

export const LogFiltersBar: React.FC<LogFiltersBarProps> = ({
  filters,
  onFilterChange,
  onReset,
  selectedCount = 0
}) => {
  const hasActiveFilters = 
    filters.searchQuery ||
    filters.levelFilter !== 'all' ||
    filters.facilityFilter !== 'all' ||
    filters.sourceFilter !== 'all'

  return (
    <div className="space-y-4 mb-4">
      {/* 搜索和快速过滤 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜索日志内容..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 日志级别过滤 */}
        <Select
          value={filters.levelFilter}
          onValueChange={(value) => onFilterChange('levelFilter', value as LogLevel | 'all')}
        >
          <SelectTrigger className="w-[130px]" aria-label="日志级别筛选">
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
          <SelectTrigger className="w-[130px]" aria-label="设施类型筛选">
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
          <SelectTrigger className="w-[130px]" aria-label="日志来源筛选">
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

        {/* 重置过滤器 */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4 mr-1" />
            清除过滤
          </Button>
        )}
      </div>

      {/* 选中状态提示 */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <Filter className="h-4 w-4" />
          <span>已选择 {selectedCount} 条日志</span>
        </div>
      )}
    </div>
  )
}
