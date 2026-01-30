/**
 * 分类筛选器组件
 * 用于筛选不同分类的巡检模板
 */

interface CategoryFilterProps {
  value: string
  onChange: (category: string) => void
  className?: string
}

const CATEGORIES = [
  { value: '', label: '全部分类' },
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
      <select
        id="category-filter"
        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {CATEGORIES.map((category) => (
          <option key={category.value} value={category.value}>
            {category.label}
          </option>
        ))}
      </select>
    </div>
  )
}
