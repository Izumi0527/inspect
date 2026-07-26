'use client'

import { useMemo } from 'react'
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/atoms'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'

interface DeviceFilterSelectProps {
  /** 已选设备 ID（空数组 = 全部设备） */
  deviceIds: number[]
  onChange: (ids: number[]) => void
}

/**
 * 监控中心设备筛选下拉（多选）
 *
 * - "全部设备"与具体设备互斥：勾选全部即清空筛选
 * - 取消最后一台已选设备时自动回到"全部设备"
 */
export function DeviceFilterSelect({ deviceIds, onChange }: DeviceFilterSelectProps) {
  const { data: devices = [], isLoading, error } = useMonitoringDevices()

  const triggerLabel = useMemo(() => {
    if (deviceIds.length === 0) return '全部设备'
    if (deviceIds.length === 1) {
      const device = devices.find((item) => item.id === deviceIds[0])
      return device ? device.name : `已选 1 台`
    }
    return `已选 ${deviceIds.length} 台`
  }, [deviceIds, devices])

  const toggleDevice = (id: number, checked: boolean) => {
    if (checked) {
      onChange([...deviceIds, id])
      return
    }
    onChange(deviceIds.filter((item) => item !== id))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-44 px-3 py-2 text-sm font-normal"
          aria-label="设备筛选"
        >
          <ListFilter className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>设备筛选</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={deviceIds.length === 0}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => onChange([])}
        >
          全部设备
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">设备列表加载中...</p>
          ) : error ? (
            <p className="px-2 py-2 text-xs text-destructive">设备列表加载失败</p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无可选设备</p>
          ) : (
            devices.map((device) => (
              <DropdownMenuCheckboxItem
                key={device.id}
                checked={deviceIds.includes(device.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => toggleDevice(device.id, checked === true)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{device.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{device.ipAddress}</span>
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
