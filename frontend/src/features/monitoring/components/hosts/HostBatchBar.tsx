'use client'

import { useState } from 'react'
import { FolderInput, Star, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DeviceGroupItem } from '@/features/devices/types'
import type { MaintenanceMode } from '../../types/zabbix-monitoring.types'

export interface HostBatchBarProps {
  selectedIds: number[]
  groups: DeviceGroupItem[]
  submitting: boolean
  canUpdateDevices: boolean
  canControlMonitoring: boolean
  onClearSelection: () => void
  onBatchPin: (action: 'pin' | 'unpin', deviceIds: number[]) => Promise<unknown>
  onBatchMoveToGroup: (deviceIds: number[], groupId: number) => Promise<unknown>
  onBatchAddMaintenance: (payload: {
    name: string
    mode: MaintenanceMode
    durationHours: number
    deviceIds: number[]
  }) => Promise<unknown>
  onBatchMaintenance?: (deviceIds: number[]) => void
}

export function HostBatchBar({
  selectedIds,
  groups,
  submitting,
  canUpdateDevices,
  canControlMonitoring,
  onClearSelection,
  onBatchPin,
  onBatchMoveToGroup,
  onBatchAddMaintenance,
  onBatchMaintenance,
}: HostBatchBarProps) {
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [targetGroupId, setTargetGroupId] = useState<string>('')
  const [maintDialogOpen, setMaintDialogOpen] = useState(false)
  const [maintName, setMaintName] = useState('')
  const [maintMode, setMaintMode] = useState<MaintenanceMode>('collect_silence')
  const [maintHours, setMaintHours] = useState(2)

  if (selectedIds.length === 0) return null

  const handleConfirmMoveGroup = async () => {
    const gid = Number.parseInt(targetGroupId, 10)
    if (!Number.isFinite(gid) || gid <= 0) return
    await onBatchMoveToGroup(selectedIds, gid)
    setGroupDialogOpen(false)
    setTargetGroupId('')
    onClearSelection()
  }

  const handleConfirmMaint = async () => {
    const name = maintName.trim() || `临时割接维护 (${selectedIds.length} 台)`
    await onBatchAddMaintenance({
      name,
      mode: maintMode,
      durationHours: maintHours,
      deviceIds: selectedIds,
    })
    setMaintDialogOpen(false)
    setMaintName('')
    onClearSelection()
  }

  return (
    <>
      <div
        role="region"
        aria-label="设备批量治理栏"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground tabular-nums">
            已选择 {selectedIds.length} 台设备
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            清空选择
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canUpdateDevices && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => setGroupDialogOpen(true)}
            >
              <FolderInput className="mr-1.5 h-3.5 w-3.5" />
              批量移入分组
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => void onBatchPin('pin', selectedIds).then(onClearSelection)}
          >
            <Star className="mr-1.5 h-3.5 w-3.5 text-warning" />
            批量加星标
          </Button>

          {canControlMonitoring && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => {
                if (onBatchMaintenance) {
                  onBatchMaintenance(selectedIds)
                  return
                }
                setMaintDialogOpen(true)
              }}
            >
              <Wrench className="mr-1.5 h-3.5 w-3.5 text-info" />
              批量加入计划维护
            </Button>
          )}
        </div>
      </div>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>批量移入分组</DialogTitle>
            <DialogDescription>
              将已选的 {selectedIds.length} 台设备统一归入指定分组。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="batch-target-group" className="block text-xs font-medium text-foreground">
              目标分组
            </label>
            <Select value={targetGroupId} onValueChange={setTargetGroupId}>
              <SelectTrigger
                id="batch-target-group"
                aria-label="目标分组"
                className="h-9 w-full gap-2 text-sm"
              >
                <SelectValue placeholder="请选择目标分组" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {`${g.name} (${g.device_count})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!targetGroupId || submitting}
              onClick={() => void handleConfirmMoveGroup()}
            >
              确认移入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={maintDialogOpen} onOpenChange={setMaintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量加入计划维护</DialogTitle>
            <DialogDescription>
              为已选的 {selectedIds.length} 台设备立即开启临时割接免打扰窗口。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="batch-maint-name" className="mb-1 block text-xs font-medium text-foreground">
                维护窗口名称
              </label>
              <input
                id="batch-maint-name"
                type="text"
                value={maintName}
                onChange={(e) => setMaintName(e.target.value)}
                placeholder={`临时割接维护 (${selectedIds.length} 台)`}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground">维护模式</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMaintMode('collect_silence')}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs ${
                    maintMode === 'collect_silence'
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  仅静默告警（仍记录曲线）
                </button>
                <button
                  type="button"
                  onClick={() => setMaintMode('pause_collection')}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs ${
                    maintMode === 'pause_collection'
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  完全暂停采集
                </button>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground">持续时长</span>
              <div className="grid grid-cols-3 gap-2">
                {[2, 4, 8].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setMaintHours(h)}
                    className={`rounded-md border py-1.5 text-xs font-medium tabular-nums ${
                      maintHours === h
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground'
                    }`}
                  >
                    {h} 小时
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMaintDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void handleConfirmMaint()}>
              确认开启维护
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
