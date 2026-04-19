/**
 * 厂商筛选器组件
 * 用于筛选不同厂商的巡检模板
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VendorFilterProps {
  value: string
  onChange: (vendor: string) => void
  className?: string
}

const ALL_VENDOR_VALUE = 'all'

const VENDORS = [
  { value: ALL_VENDOR_VALUE, label: '全部厂商' },
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
      <Select
        value={value || ALL_VENDOR_VALUE}
        onValueChange={(selectedValue) =>
          onChange(selectedValue === ALL_VENDOR_VALUE ? '' : selectedValue)
        }
      >
        <SelectTrigger
          id="vendor-filter"
          className={`w-full h-10 rounded-lg px-3 text-sm ${value ? 'border-primary/50 bg-primary/5 text-foreground shadow-sm' : ''}`}
          aria-label="厂商筛选"
        >
          <SelectValue placeholder="全部厂商" />
        </SelectTrigger>
        <SelectContent>
          {VENDORS.map((vendor) => (
            <SelectItem key={vendor.value} value={vendor.value}>
              {vendor.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
