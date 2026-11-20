'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Edit3, Plus, Trash2, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardContent } from '@/components/atoms'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import {
  useCreateMonitoringMaintenanceMutation,
  useDeleteMonitoringMaintenanceMutation,
  useMonitoringMaintenances,
  useUpdateMonitoringMaintenanceMutation,
} from '../../hooks/useMonitoringConfig'
import type { MaintenanceInput, MaintenanceView } from '../../types/zabbix-monitoring.types'
import { MaintenanceModal } from './MaintenanceModal'
import {
  formatMaintenanceWindowSchedule,
  getMaintenanceLifecycleStatus,
  MAINTENANCE_MODE_META,
  SCHEDULE_TYPE_LABELS,
  type MaintenanceLifecycleStatus,
} from './maintenanceHelpers'

type StatusFilter = 'all' | MaintenanceLifecycleStatus

const STATUS_BADGE: Record<
  MaintenanceLifecycleStatus,
  { label: string; variant: 'info' | 'warning' | 'neutral' }
> = {
  active: { label: '进行中', variant: 'info' },
  pending: { label: '待生效', variant: 'warning' },
  ended: { label: '已结束', variant: 'neutral' },
}

export function MaintenanceTab() {
  const canControl = usePermission(Permission.MONITORING_CONTROL)
  const { data: windows = [], isLoading, error } = useMonitoringMaintenances()
  const { data: groups = [] } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
  })
  const { data: devices = [] } = useMonitoringDevices()

  const createMaint = useCreateMonitoringMaintenanceMutation()
  const updateMaint = useUpdateMonitoringMaintenanceMutation()
  const deleteMaint = useDeleteMonitoringMaintenanceMutation()

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWindow, setEditingWindow] = useState<MaintenanceView | null>(null)

  const classified = useMemo(
    () =>
      windows.map((win) => ({
        win,
        status: getMaintenanceLifecycleStatus(win),
      })),
    [windows]
  )

  const counts = useMemo(
    () => ({
      all: classified.length,
      active: classified.filter((c) => c.status === 'active').length,
      pending: classified.filter((c) => c.status === 'pending').length,
      ended: classified.filter((c) => c.status === 'ended').length,
    }),
    [classified]
  )

  const visibleList = useMemo(
    () => (filter === 'all' ? classified : classified.filter((c) => c.status === filter)),
    [classified, filter]
  )

  const handleSave = async (input: MaintenanceInput) => {
    try {
      if (editingWindow) {
        await updateMaint.mutateAsync({ id: editingWindow.id, input })
        toast.success('计划维护窗口已更新')
      } else {
        await createMaint.mutateAsync(input)
        toast.success('计划维护窗口已创建')
      }
      setModalOpen(false)
      setEditingWindow(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存计划维护失败')
    }
  }

  const handleDelete = async (win: MaintenanceView) => {
    try {
      await deleteMaint.mutateAsync(win.id)
      toast.success(`已删除维护窗口「${win.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除维护窗口失败')
    }
  }

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">正在加载计划维护看板...</Card>
  }
  if (error) {
    return (
      <Card className="border-danger/40 bg-danger-soft p-6 text-sm text-danger-soft-foreground">
        加载计划维护失败：{error.message}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">计划维护（割接免打扰）</h2>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/70 p-1">
                {(['all', 'active', 'pending', 'ended'] as const).map((key) => {
                  const label =
                    key === 'all'
                      ? '全部'
                      : key === 'active'
                        ? '进行中'
                        : key === 'pending'
                          ? '待生效'
                          : '已结束'
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                        filter === key
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label} ({counts[key]})
                    </button>
                  )
                })}
              </div>
            </div>

            {canControl && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingWindow(null)
                  setModalOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建维护窗口
              </Button>
            )}
          </div>

          {visibleList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              当前筛选下暂无计划维护窗口。
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleList.map(({ win, status }) => {
                const statusMeta = STATUS_BADGE[status]
                const modeMeta = MAINTENANCE_MODE_META[win.mode] ?? MAINTENANCE_MODE_META.collect_silence
                const targetLabels = win.targets.map((t) => {
                  if (t.target_type === 'device_group') {
                    return `分组: ${groups.find((g) => g.id === t.target_id)?.name ?? `#${t.target_id}`}`
                  }
                  return `设备: ${devices.find((d) => d.id === t.target_id)?.name ?? `#${t.target_id}`}`
                })

                return (
                  <div
                    key={win.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface-2/40 p-3.5"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusMeta.variant} size="sm">
                          {statusMeta.label}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">{win.name}</span>
                        <Badge variant={modeMeta.badgeVariant} size="sm">
                          {modeMeta.label}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {SCHEDULE_TYPE_LABELS[win.schedule_type] ?? win.schedule_type}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatMaintenanceWindowSchedule(win)}</span>
                      </div>

                      {targetLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {targetLabels.map((lbl) => (
                            <Badge key={lbl} variant="secondary" size="sm">
                              {lbl}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {canControl && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingWindow(win)
                            setModalOpen(true)
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`删除维护窗口 ${win.name}`}
                          onClick={() => void handleDelete(win)}
                          className="h-8 w-8 text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <MaintenanceModal
        open={modalOpen}
        editingWindow={editingWindow}
        submitting={createMaint.isPending || updateMaint.isPending}
        onClose={() => {
          setModalOpen(false)
          setEditingWindow(null)
        }}
        onSubmit={(input) => void handleSave(input)}
      />
    </div>
  )
}
