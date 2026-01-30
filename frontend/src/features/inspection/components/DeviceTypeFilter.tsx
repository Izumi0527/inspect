/**
 * 设备类型筛选器组件
 * 用于筛选不同设备类型的巡检模板
 */

interface DeviceTypeFilterProps {
  value: string
  onChange: (deviceType: string) => void
  className?: string
}

const DEVICE_TYPES = [
  { value: '', label: '全部设备类型' },
  { value: 'router', label: '路由器' },
  { value: 'switch', label: '交换机' },
  { value: 'firewall', label: '防火墙' },
]

export function DeviceTypeFilter({ value, onChange, className = '' }: DeviceTypeFilterProps) {
  return (
    <div className={className}>
      <label htmlFor="device-type-filter" className="block text-sm font-medium mb-1">
        设备类型
      </label>
      <select
        id="device-type-filter"
        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {DEVICE_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>
  )
}
