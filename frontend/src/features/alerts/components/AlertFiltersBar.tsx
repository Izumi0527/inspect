import React from 'react'
import { Search, Filter } from 'lucide-react'
import { Card, CardContent, Button, Input } from '@/components/atoms'
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
        <Input
          type="text"
          placeholder="搜索告警..."
          value={filters.searchQuery}
          onChange={(e) => onFilterChange('searchQuery', e.target.value)}
          className="pl-10"
        />
      </div>

      <select
        value={filters.severityFilter}
        onChange={(e) => onFilterChange('severityFilter', e.target.value)}
        className="px-4 py-2 border border-border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto sm:min-w-[180px] bg-card text-foreground"
      >
        <option value="all">所有严重级别</option>
        <option value="critical">严重</option>
        <option value="warning">警告</option>
        <option value="info">信息</option>
      </select>

      <select
        value={filters.statusFilter}
        onChange={(e) => onFilterChange('statusFilter', e.target.value)}
        className="px-4 py-2 border border-border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto sm:min-w-[150px] bg-card text-foreground"
      >
        <option value="all">所有状态</option>
        <option value="active">活跃</option>
        <option value="acknowledged">已确认</option>
        <option value="resolved">已解决</option>
      </select>
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
