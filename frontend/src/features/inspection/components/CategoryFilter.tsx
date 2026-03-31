/**
 * 分类筛选器组件
 * 用于筛选不同分类的巡检模板
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CategoryFilterProps {
  value: string
  onChange: (category: string) => void
  className?: string
}

const ALL_CATEGORY_VALUE = 'all'

const CATEGORIES = [
  { value: ALL_CATEGORY_VALUE, label: '全部分类' },
  { value: 'network', label: '网络' },
  { value: 'system', label: '系统' },
  { value: 'security', label: '安全' },
  { value: 'custom', label: '自定义' },
]

export function CategoryFilter({ value, onChange, className = '' }: CategoryFilterProps) {
  return (
    <div className={className}>
      <label htmlFor="category-filter" className="block text-sm font-medium mb-1">
        分类
      </label>
      <Select
        value={value || ALL_CATEGORY_VALUE}
        onValueChange={(selectedValue) =>
          onChange(selectedValue === ALL_CATEGORY_VALUE ? '' : selectedValue)
        }
      >
        <SelectTrigger
          id="category-filter"
          className="w-full"
          aria-label="分类筛选"
        >
          <SelectValue placeholder="全部分类" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((category) => (
            <SelectItem key={category.value} value={category.value}>
              {category.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
