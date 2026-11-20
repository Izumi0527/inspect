'use client'

import { Checkbox } from '@/components/ui/checkbox'
import type { DeviceGroupItem } from '@/features/devices/types'
import type { MonitoringDeviceOption } from '../../types'

interface MaintenanceTargetsSectionProps {
  groups: DeviceGroupItem[]
  devices: MonitoringDeviceOption[]
  selectedGroupIds: number[]
  selectedDeviceIds: number[]
  errorMessage: string | null
  onChangeGroups: (ids: number[]) => void
  onChangeDevices: (ids: number[]) => void
}

export function MaintenanceTargetsSection({
  groups,
  devices,
  selectedGroupIds,
  selectedDeviceIds,
  errorMessage,
  onChangeGroups,
  onChangeDevices,
}: MaintenanceTargetsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground">目标设备分组</p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto">
            {groups.map((g) => {
              const checked = selectedGroupIds.includes(g.id)
              return (
                <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      onChangeGroups(c ? [...selectedGroupIds, g.id] : selectedGroupIds.filter((id) => id !== g.id))
                    }
                  />
                  <span className="truncate">{g.name}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground">指定目标设备</p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto">
            {devices.map((d) => {
              const checked = selectedDeviceIds.includes(d.id)
              return (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      onChangeDevices(c ? [...selectedDeviceIds, d.id] : selectedDeviceIds.filter((id) => id !== d.id))
                    }
                  />
                  <span className="truncate">{d.name} ({d.ipAddress})</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
      {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
    </div>
  )
}
