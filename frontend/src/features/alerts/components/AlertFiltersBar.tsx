import React from 'react'
import { Search, Filter } from 'lucide-react'
import { Card, CardContent, Button, Input } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertFilters, AlertAction } from '../types'

interface AlertFiltersBarProps {
  filters: AlertFilters
  onFilterChange: (key: keyof AlertFilters, value: string) => void
  selectedCount: number
  onBulkAction?: (action: AlertAction) => void
  renderAsCard?: boolean // 是否渲染为独立Card，默认true保持向后兼容
}

export const AlertFiltersBar: React.FC<AlertFiltersBarProps> = ({
  filters,
  onFilterChange,
  selectedCount,
  onBulkAction,
  renderAsCard = true // 默认true保持向后兼容
}) => {
  // 筛选器内容
  const filtersContent = (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="relative flex-1 w-full sm:max-w-md">
        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
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
          className="pl-10"
        />
      </div>

      <Select
        value={filters.severityFilter}
        onValueChange={(value) => onFilterChange('severityFilter', value)}
      >
        <SelectTrigger
          className="w-full sm:w-[180px]"
          aria-label="严重级别筛选"
        >
          <SelectValue placeholder="严重级别" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有严重级别</SelectItem>
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
          className="w-full sm:w-[150px]"
          aria-label="状态筛选"
        >
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有状态</SelectItem>
          <SelectItem value="active">活跃</SelectItem>
          <SelectItem value="acknowledged">已确认</SelectItem>
          <SelectItem value="resolved">已解决</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  // 根据renderAsCard决定是否包裹Card
  if (renderAsCard) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-1 gap-4 w-full lg:w-auto">
              {filtersContent}
            </div>

            <div className="flex gap-2 items-center">
              {selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    已选择 {selectedCount} 项
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onBulkAction?.('acknowledge')}
                  >
                    批量确认
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onBulkAction?.('resolve')}
                  >
                    批量解决
                  </Button>
                </div>
              )}
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                高级筛选
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 不使用Card时，直接返回内容
  return (
    <div className="mb-6">
      {filtersContent}
    </div>
  )
}
