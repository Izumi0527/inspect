'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, RotateCcw, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button } from '@/components/atoms'
import { Checkbox } from '@/components/ui/checkbox'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
import { DeviceGroupModal } from '@/features/devices/components/DeviceGroupModal'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import {
  useUpdateMonitoringTemplateMutation,
  useUpdateTemplateBindingsMutation,
} from '../../hooks/useMonitoringConfig'
import type { TemplateDetailResponse, TemplateMacro } from '../../types/zabbix-monitoring.types'
import { DeviceOverrideModal } from './DeviceOverrideModal'
import { ThresholdScopeMacrosCard } from './ThresholdScopeMacrosCard'
import { parseDeviceOverrideMap, parseTemplateMacros } from './templateConfigHelpers'

interface ThresholdScopePanelProps {
  template: TemplateDetailResponse
  canControl: boolean
}

export function ThresholdScopePanel({ template, canControl }: ThresholdScopePanelProps) {
  const queryClient = useQueryClient()
  const canCreateGroup = usePermission(Permission.DEVICES_CREATE)
  const canUpdateGroup = usePermission(Permission.DEVICES_UPDATE)
  const canDeleteGroup = usePermission(Permission.DEVICES_DELETE)

  const { data: groups = [] } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
  })
  const { data: devices = [] } = useMonitoringDevices()
  const updateTemplate = useUpdateMonitoringTemplateMutation()
  const updateBindings = useUpdateTemplateBindingsMutation()

  const [macrosDraft, setMacrosDraft] = useState<TemplateMacro[]>(() => parseTemplateMacros(template))
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(template.bound_group_ids ?? [])
  const [addDeviceId, setAddDeviceId] = useState('')
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [overrideTargetId, setOverrideTargetId] = useState<number | null>(null)

  useEffect(() => {
    setMacrosDraft(parseTemplateMacros(template))
    setSelectedGroupIds(template.bound_group_ids ?? [])
  }, [template])

  const handleSaveDefaultMacros = async () => {
    if (template.is_builtin || !canControl) return
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        input: {
          name: template.name,
          vendor: template.vendor,
          device_type: template.device_type,
          description: template.description,
          default_interval_sec: template.default_interval_sec,
          macros: macrosDraft,
        },
      })
      toast.success('方案默认阈值参数已更新')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新默认阈值失败')
    }
  }

  const handleSaveGroups = async () => {
    try {
      await updateBindings.mutateAsync({
        id: template.id,
        input: { group_ids: selectedGroupIds, replace_groups: true },
      })
      toast.success('已更新按设备组自动生效范围')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新设备组生效范围失败')
    }
  }

  const handleBindDevice = async () => {
    const id = Number(addDeviceId)
    if (!Number.isInteger(id) || id <= 0) return
    try {
      await updateBindings.mutateAsync({ id: template.id, input: { device_ids: [id] } })
      setAddDeviceId('')
      toast.success('已绑定该设备到当前监控方案')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '绑定设备失败')
    }
  }

  const handleSaveOverride = async (deviceId: number, overrides: Record<string, string>) => {
    try {
      const input =
        Object.keys(overrides).length > 0
          ? { device_overrides: { [deviceId]: overrides } }
          : { clear_overrides: [deviceId] }
      await updateBindings.mutateAsync({ id: template.id, input })
      setOverrideTargetId(null)
      toast.success('已保存单台设备阈值微调')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存阈值微调失败')
    }
  }

  const handleClearOverride = async (deviceId: number) => {
    try {
      await updateBindings.mutateAsync({ id: template.id, input: { clear_overrides: [deviceId] } })
      toast.success('已恢复沿用方案默认阈值')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '恢复默认阈值失败')
    }
  }

  const boundDeviceIds = template.bound_device_ids ?? []
  const overrideDevice = devices.find((d) => d.id === overrideTargetId)
  const initialOverrides =
    overrideTargetId !== null ? parseDeviceOverrideMap(template.device_overrides?.[overrideTargetId]) : {}

  return (
    <div className="space-y-5">
      <ThresholdScopeMacrosCard
        macros={macrosDraft}
        isBuiltin={template.is_builtin}
        canControl={canControl}
        saving={updateTemplate.isPending}
        onChange={setMacrosDraft}
        onSave={() => void handleSaveDefaultMacros()}
      />

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">① 按设备组自动生效</h3>
            <p className="text-xs text-muted-foreground">勾选设备分组后，该组内现有及新加入的设备将自动套用本监控方案</p>
          </div>
          <div className="flex items-center gap-2">
            {(canCreateGroup || canUpdateGroup) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setGroupModalOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5 text-primary" />
                + 新建设备分组
              </Button>
            )}
            {canControl && (
              <Button type="button" size="sm" loading={updateBindings.isPending} onClick={() => void handleSaveGroups()}>
                保存生效分组
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const checked = selectedGroupIds.includes(g.id)
            return (
              <label
                key={g.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  checked ? 'border-primary bg-primary/5' : 'border-border bg-surface-2/40'
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Checkbox
                    disabled={!canControl}
                    checked={checked}
                    onCheckedChange={(next) =>
                      setSelectedGroupIds((prev) => (next ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                    }
                  />
                  <span className="truncate">{g.name}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">{g.device_count} 台</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">② 生效设备列表与单台微调</h3>
            <p className="text-xs text-muted-foreground">单台设备微调优先级高于方案默认，支持随时一键恢复默认</p>
          </div>
          {canControl && (
            <div className="flex items-center gap-2">
              <select
                aria-label="选择要绑定的设备"
                value={addDeviceId}
                onChange={(e) => setAddDeviceId(e.target.value)}
                className="h-8 min-w-44 rounded-md border border-input bg-card px-2 text-xs text-foreground"
              >
                <option value="">添加单台设备...</option>
                {devices.filter((d) => !boundDeviceIds.includes(d.id)).map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="outline" disabled={!addDeviceId} onClick={() => void handleBindDevice()}>
                绑定设备
              </Button>
            </div>
          )}
        </div>

        {boundDeviceIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无直接指定的单台设备。</p>
        ) : (
          <div className="space-y-2">
            {boundDeviceIds.map((deviceId) => {
              const dev = devices.find((d) => d.id === deviceId)
              const overrides = parseDeviceOverrideMap(template.device_overrides?.[deviceId])
              const hasOverride = Object.keys(overrides).length > 0
              return (
                <div key={deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {dev ? `${dev.name} (${dev.ipAddress})` : `设备 #${deviceId}`}
                    </span>
                    <Badge variant={hasOverride ? 'warning' : 'success'} size="sm">
                      {hasOverride ? '已单独微调' : '沿用方案默认'}
                    </Badge>
                    {hasOverride && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {Object.entries(overrides)
                          .map(([k, v]) => `${macrosDraft.find((m) => m.key === k)?.label ?? k}: ${v}`)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  {canControl && (
                    <div className="flex items-center gap-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => setOverrideTargetId(deviceId)}>
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        单台微调
                      </Button>
                      {hasOverride && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => void handleClearOverride(deviceId)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          恢复默认
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DeviceGroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        canCreate={canCreateGroup}
        canUpdate={canUpdateGroup}
        canDelete={canDeleteGroup}
        onMutated={() => { void queryClient.invalidateQueries({ queryKey: DEVICE_GROUPS_QUERY_KEY }) }}
      />
      <DeviceOverrideModal
        open={overrideTargetId !== null}
        deviceName={overrideDevice ? overrideDevice.name : overrideTargetId ? `设备 #${overrideTargetId}` : ''}
        macros={macrosDraft}
        initialOverrides={initialOverrides}
        submitting={updateBindings.isPending}
        onClose={() => setOverrideTargetId(null)}
        onSave={(ov) => { if (overrideTargetId !== null) void handleSaveOverride(overrideTargetId, ov) }}
      />
    </div>
  )
}
