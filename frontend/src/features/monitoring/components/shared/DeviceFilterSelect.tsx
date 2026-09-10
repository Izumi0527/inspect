'use client'

import { useMemo } from 'react'
import { ListFilter } from 'lucide-react'
import { Button, Popover, PopoverTrigger, PopoverContent } from '@/components/atoms'
import { Checkbox } from '@/components/ui/checkbox'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'

interface DeviceFilterSelectProps {
  /** 已选设备 ID（空数组 = 全部设备） */
  deviceIds: number[]
  onChange: (ids: number[]) => void
}

const rowClassName =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent/15'

// 共享 Checkbox 的 rounded-sm 在本项目主题里等于 12px（--radius-sm = 16px - 4px），16px 的框会变成圆形、
// 看起来像单选按钮；这里明确用方角，让它读作"可多选的勾选框"
const checkboxClassName = 'rounded-[4px]'

/**
 * 监控中心设备筛选（勾选框列表）
 *
 * - 每行前置始终可见的勾选框；"全部设备"与具体设备互斥：勾选全部即清空筛选
 * - 取消最后一台已选设备时自动回到"全部设备"
 * - 面板宽度不固定，由最长的设备名/IP 撑开（设上限防止极端长名撑爆视口）
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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-44 px-3 py-2 text-sm font-normal"
          aria-label="设备筛选"
        >
          <ListFilter className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="group"
        aria-label="设备筛选"
        align="end"
        className="w-auto min-w-40 max-w-[min(22rem,calc(100vw-2rem))] p-1"
      >
        <label className={rowClassName}>
          <Checkbox className={checkboxClassName} checked={deviceIds.length === 0} onCheckedChange={() => onChange([])} />
          <span>全部设备</span>
        </label>
        <div role="separator" className="my-1 h-px bg-muted" />
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">设备列表加载中...</p>
          ) : error ? (
            <p className="px-2 py-2 text-xs text-destructive">设备列表加载失败</p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无可选设备</p>
          ) : (
            devices.map((device) => (
              <label key={device.id} className={rowClassName}>
                <Checkbox
                  className={checkboxClassName}
                  checked={deviceIds.includes(device.id)}
                  onCheckedChange={(checked) => toggleDevice(device.id, checked)}
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate">{device.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{device.ipAddress}</span>
                </span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
