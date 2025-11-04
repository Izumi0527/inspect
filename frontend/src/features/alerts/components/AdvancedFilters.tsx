import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, X, Calendar, Filter } from 'lucide-react'
import { Button } from '@/components/atoms/button'
import { Input } from '@/components/atoms/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/atoms/select'
import { Card, CardContent } from '@/components/atoms/card'
import { cn } from '@/utils/cn'
import { AlertSeverity, AlertStatus, AlertCategory } from '../types'

interface DateRange {
  start: string
  end: string
}

interface AdvancedFiltersProps {
  onFilterChange: (filters: AdvancedFilterValues) => void
  onReset: () => void
}

export interface AdvancedFilterValues {
  search?: string
  severity?: AlertSeverity[]
  status?: AlertStatus[]
  category?: AlertCategory[]
  deviceIds?: string[]
  dateRange?: DateRange
  dateRangePreset?: 'today' | 'last7days' | 'last30days' | 'custom'
}

const STORAGE_KEY = 'alert_advanced_filters'

/**
 * AdvancedFilters 高级过滤组件
 *
 * 提供多维度的告警过滤功能，包括时间范围、严重级别、状态等
 * 支持过滤条件的持久化存储
 */
export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  onFilterChange,
  onReset
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [filters, setFilters] = useState<AdvancedFilterValues>({})

  // 从 localStorage 加载过滤条件
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setFilters(parsed)
        onFilterChange(parsed)
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error)
    }
  }, [])

  // 保存过滤条件到 localStorage
  const saveFilters = (newFilters: AdvancedFilterValues) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFilters))
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }

  // 更新单个过滤条件
  const updateFilter = <K extends keyof AdvancedFilterValues>(
    key: K,
    value: AdvancedFilterValues[K]
  ) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    saveFilters(newFilters)
    onFilterChange(newFilters)
  }

  // 重置所有过滤条件
  const handleReset = () => {
    setFilters({})
    localStorage.removeItem(STORAGE_KEY)
    onReset()
  }

  // 计算日期范围
  const calculateDateRange = (preset: string): DateRange => {
    const end = new Date()
    const start = new Date()

    switch (preset) {
      case 'today':
        start.setHours(0, 0, 0, 0)
        break
      case 'last7days':
        start.setDate(start.getDate() - 7)
        break
      case 'last30days':
        start.setDate(start.getDate() - 30)
        break
      default:
        return filters.dateRange || { start: '', end: '' }
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  }

  // 处理日期范围预设变更
  const handleDateRangePresetChange = (preset: string) => {
    if (preset === 'custom') {
      updateFilter('dateRangePreset', 'custom')
    } else {
      const range = calculateDateRange(preset)
      updateFilter('dateRange', range)
      updateFilter('dateRangePreset', preset as any)
    }
  }

  // 统计已应用的过滤条件数量
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'dateRangePreset') return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return false
  }).length

  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        {/* 头部：展开/收起按钮 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>高级过滤</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4 mr-1" />
              清除全部
            </Button>
          )}
        </div>

        {/* 过滤条件面板 */}
        {isExpanded && (
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {/* 第一行：关键词搜索 + 时间范围 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 关键词搜索 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  关键词搜索
                </label>
                <Input
                  type="text"
                  placeholder="搜索告警标题、描述或设备..."
                  value={filters.search || ''}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="w-full"
                />
              </div>

              {/* 时间范围预设 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  时间范围
                </label>
                <Select
                  value={filters.dateRangePreset || 'all'}
                  onValueChange={handleDateRangePresetChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择时间范围" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部时间</SelectItem>
                    <SelectItem value="today">今天</SelectItem>
                    <SelectItem value="last7days">最近 7 天</SelectItem>
                    <SelectItem value="last30days">最近 30 天</SelectItem>
                    <SelectItem value="custom">自定义范围</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 自定义日期范围 */}
            {filters.dateRangePreset === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    开始日期
                  </label>
                  <Input
                    type="date"
                    value={filters.dateRange?.start || ''}
                    onChange={(e) =>
                      updateFilter('dateRange', {
                        ...filters.dateRange,
                        start: e.target.value,
                        end: filters.dateRange?.end || ''
                      })
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    结束日期
                  </label>
                  <Input
                    type="date"
                    value={filters.dateRange?.end || ''}
                    onChange={(e) =>
                      updateFilter('dateRange', {
                        start: filters.dateRange?.start || '',
                        end: e.target.value
                      })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* 第二行：严重级别 + 状态 + 分类 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 严重级别多选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  严重级别
                </label>
                <div className="space-y-2">
                  {(['critical', 'warning', 'info'] as AlertSeverity[]).map((severity) => (
                    <label key={severity} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.severity?.includes(severity) || false}
                        onChange={(e) => {
                          const current = filters.severity || []
                          const updated = e.target.checked
                            ? [...current, severity]
                            : current.filter((s) => s !== severity)
                          updateFilter('severity', updated)
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className={cn(
                        'text-sm',
                        severity === 'critical' && 'text-red-600 font-medium',
                        severity === 'warning' && 'text-yellow-600 font-medium',
                        severity === 'info' && 'text-blue-600'
                      )}>
                        {severity === 'critical' && '严重'}
                        {severity === 'warning' && '警告'}
                        {severity === 'info' && '信息'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 状态多选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  状态
                </label>
                <div className="space-y-2">
                  {(['active', 'acknowledged', 'resolved'] as AlertStatus[]).map((status) => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.status?.includes(status) || false}
                        onChange={(e) => {
                          const current = filters.status || []
                          const updated = e.target.checked
                            ? [...current, status]
                            : current.filter((s) => s !== status)
                          updateFilter('status', updated)
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {status === 'active' && '活跃'}
                        {status === 'acknowledged' && '已确认'}
                        {status === 'resolved' && '已解决'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 分类多选（暂时使用简单实现，后续可改为从后端获取） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  分类
                </label>
                <div className="space-y-2">
                  {['connectivity', 'performance', 'security'].map((category) => (
                    <label key={category} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.category?.includes(category as AlertCategory) || false}
                        onChange={(e) => {
                          const current = filters.category || []
                          const updated = e.target.checked
                            ? [...current, category as AlertCategory]
                            : current.filter((c) => c !== category)
                          updateFilter('category', updated)
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {category === 'connectivity' && '连通性'}
                        {category === 'performance' && '性能'}
                        {category === 'security' && '安全'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500">
                {activeFilterCount > 0 ? (
                  <span>已应用 {activeFilterCount} 个过滤条件</span>
                ) : (
                  <span>未应用过滤条件</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  重置
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsExpanded(false)}
                >
                  应用
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
