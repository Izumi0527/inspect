import React from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { Badge, Button, SimpleInput as Input } from '@/components/atoms'
import { VendorFilter } from './VendorFilter'
import { DeviceTypeFilter } from './DeviceTypeFilter'
import { CategoryFilter } from './CategoryFilter'

const DEVICE_TYPE_LABELS: Record<string, string> = {
  router: '路由器',
  switch: '交换机',
  firewall: '防火墙',
}

const CATEGORY_LABELS: Record<string, string> = {
  network: '网络',
  system: '系统',
  security: '安全',
  custom: '自定义',
}

type TemplateFiltersState = {
  vendor?: string
  deviceType?: string
  category?: string
}

interface TemplateFiltersBarProps {
  filters: TemplateFiltersState
  searchText: string
  onFilterChange: (key: 'vendor' | 'deviceType' | 'category', value: string) => void
  onSearchChange: (value: string) => void
  onClearAll: () => void
  onRefresh: () => void
}

export function TemplateFiltersBar({
  filters,
  searchText,
  onFilterChange,
  onSearchChange,
  onClearAll,
  onRefresh,
}: TemplateFiltersBarProps) {
  const activeFilters = [
    searchText
      ? {
          id: 'search',
          label: `搜索: ${searchText}`,
          onRemove: () => onSearchChange(''),
        }
      : null,
    filters.vendor
      ? {
          id: 'vendor',
          label: `厂商: ${filters.vendor}`,
          onRemove: () => onFilterChange('vendor', ''),
        }
      : null,
    filters.deviceType
      ? {
          id: 'deviceType',
          label: `设备类型: ${DEVICE_TYPE_LABELS[filters.deviceType] || filters.deviceType}`,
          onRemove: () => onFilterChange('deviceType', ''),
        }
      : null,
    filters.category
      ? {
          id: 'category',
          label: `分类: ${CATEGORY_LABELS[filters.category] || filters.category}`,
          onRemove: () => onFilterChange('category', ''),
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string
    label: string
    onRemove: () => void
  }>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="w-full xl:max-w-[22rem]">
          <label htmlFor="template-search" className="sr-only">
            搜索模板
          </label>
          <Input
            id="template-search"
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索模板名称或描述..."
            leftIcon={<Search className="h-4 w-4" />}
            className="h-9 rounded-lg border-border/60 bg-card/75 px-3 text-sm shadow-sm transition-all duration-200 focus:border-primary/60 focus:bg-background"
          />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-2.5 md:grid-cols-3">
          <VendorFilter
            value={filters.vendor || ''}
            onChange={(value) => onFilterChange('vendor', value)}
          />
          <DeviceTypeFilter
            value={filters.deviceType || ''}
            onChange={(value) => onFilterChange('deviceType', value)}
          />
          <CategoryFilter
            value={filters.category || ''}
            onChange={(value) => onFilterChange('category', value)}
          />
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/35 px-3 py-2 shadow-sm">
          <Badge variant="secondary" size="sm" className="rounded-full px-2.5 text-[11px] font-semibold tracking-[0.01em]">
            已应用 {activeFilters.length} 个
          </Badge>
          {activeFilters.map((filter) => (
            <Badge key={filter.id} variant="outline" size="sm" asChild>
              <button
                type="button"
                onClick={filter.onRemove}
                aria-label={`移除 ${filter.label} 筛选`}
                className="cursor-pointer rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground/90 shadow-sm transition-colors duration-150 hover:bg-accent/60 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {filter.label}
              </button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">
            清除筛选
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="h-9 rounded-lg border-border/70 bg-background/80 px-3 text-sm shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
      )}
    </div>
  )
}
