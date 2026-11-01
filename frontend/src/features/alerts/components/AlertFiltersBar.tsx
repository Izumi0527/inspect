import React from 'react'
import { Search, EyeOff, X } from 'lucide-react'
import { Input } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertFilters } from '../types'

interface AlertFiltersBarProps {
  filters: AlertFilters
  onFilterChange: (key: keyof AlertFilters, value: string) => void
}

export const AlertFiltersBar: React.FC<AlertFiltersBarProps> = ({
  filters,
  onFilterChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
        <label htmlFor="alert-search-input" className="sr-only">
          搜索告警
        </label>
        <Input
          id="alert-search-input"
          name="alert-search"
          type="text"
          placeholder="搜索告警..."
          value={filters.searchQuery}
          onChange={(e) => onFilterChange('searchQuery', e.target.value)}
          className="h-9 pl-10 text-sm"
        />
      </div>

      <div className="relative w-full sm:w-64">
        <EyeOff className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
        <label htmlFor="alert-exclude-input" className="sr-only">
          屏蔽告警关键字
        </label>
        <Input
          id="alert-exclude-input"
          name="alert-exclude"
          type="text"
          placeholder="屏蔽关键字（逗号分隔）..."
          value={filters.excludeQuery ?? ''}
          onChange={(e) => onFilterChange('excludeQuery', e.target.value)}
          className="h-9 pl-10 pr-8 text-sm"
        />
        {(filters.excludeQuery ?? '').length > 0 && (
          <button
            type="button"
            aria-label="清空屏蔽关键字"
            onClick={() => onFilterChange('excludeQuery', '')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select
        value={filters.severityFilter}
        onValueChange={(value) => onFilterChange('severityFilter', value)}
      >
        <SelectTrigger
          className="h-9 w-auto gap-2 text-sm"
          aria-label="严重级别筛选"
        >
          <SelectValue placeholder="严重级别" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">级别</SelectItem>
          <SelectItem value="critical">严重</SelectItem>
          <SelectItem value="warning">警告</SelectItem>
          <SelectItem value="info">信息</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.statusFilter}
        onValueChange={(value) => onFilterChange('statusFilter', value)}
      >
        <SelectTrigger
          className="h-9 w-auto gap-2 text-sm"
          aria-label="状态筛选"
        >
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">状态</SelectItem>
          <SelectItem value="active">活跃</SelectItem>
          <SelectItem value="acknowledged">已确认</SelectItem>
          <SelectItem value="resolved">已解决</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
