/**
 * 厂商筛选器组件
 * 用于筛选不同厂商的巡检模板
 */

interface VendorFilterProps {
  value: string
  onChange: (vendor: string) => void
  className?: string
}

const VENDORS = [
  { value: '', label: '全部厂商' },
  { value: 'Cisco', label: 'Cisco' },
  { value: 'Huawei', label: 'Huawei' },
  { value: 'H3C', label: 'H3C' },
  { value: 'Juniper', label: 'Juniper' },
  { value: 'Arista', label: 'Arista' },
  { value: 'Fortinet', label: 'Fortinet' },
]

export function VendorFilter({ value, onChange, className = '' }: VendorFilterProps) {
  return (
    <div className={className}>
      <label htmlFor="vendor-filter" className="block text-sm font-medium mb-1">
        厂商
      </label>
      <select
        id="vendor-filter"
        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {VENDORS.map((vendor) => (
          <option key={vendor.value} value={vendor.value}>
            {vendor.label}
          </option>
        ))}
      </select>
    </div>
  )
}
