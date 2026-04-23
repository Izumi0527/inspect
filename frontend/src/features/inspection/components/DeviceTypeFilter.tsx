/**
 * 设备类型筛选器组件
 * 用于筛选不同设备类型的巡检模板
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DeviceTypeFilterProps {
  value: string
  onChange: (deviceType: string) => void
  className?: string
}

const ALL_DEVICE_TYPE_VALUE = 'all'

const DEVICE_TYPES = [
  { value: ALL_DEVICE_TYPE_VALUE, label: '全部设备类型' },
  { value: 'router', label: '路由器' },
  { value: 'switch', label: '交换机' },
  { value: 'firewall', label: '防火墙' },
]

export function DeviceTypeFilter({ value, onChange, className = '' }: DeviceTypeFilterProps) {
  return (
    <div className={className}>
      <Select
        value={value || ALL_DEVICE_TYPE_VALUE}
        onValueChange={(selectedValue) =>
          onChange(selectedValue === ALL_DEVICE_TYPE_VALUE ? '' : selectedValue)
        }
      >
        <SelectTrigger
          id="device-type-filter"
          className={`w-full h-9 rounded-lg px-3 text-sm ${value ? 'border-primary/50 bg-primary/5 text-foreground shadow-sm' : ''}`}
          aria-label="设备类型筛选"
        >
          <SelectValue placeholder="全部设备类型" />
        </SelectTrigger>
        <SelectContent>
          {DEVICE_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
