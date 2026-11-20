'use client'

import { useState } from 'react'
import { AlertCircle, Search, Star } from 'lucide-react'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useMonitoringHosts } from '../../hooks/useMonitoringHosts'
import { GroupTreeSidebar } from './GroupTreeSidebar'
import { HostBatchBar } from './HostBatchBar'
import { HostsMatrixTable } from './HostsMatrixTable'

export interface HostsMatrixTabProps {
  activeGroupId: number | null
  initialStatusFilter: string | null
  onSelectGroup: (groupId: number | null) => void
  onSelectHost: (deviceId: number) => void
  onBatchMaintenance?: (deviceIds: number[]) => void
}

const STATUS_PILLS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'online', label: '正常' },
  { value: 'warning', label: '负载偏高' },
  { value: 'critical', label: '过载告警' },
  { value: 'offline', label: '离线' },
  { value: 'maintenance', label: '维护中' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '异常优先（默认）' },
  { value: 'cpu_usage', label: '按 CPU 使用率' },
  { value: 'memory_usage', label: '按内存使用率' },
  { value: 'temperature', label: '按设备温度' },
  { value: 'response_time', label: '按 Ping 延迟' },
  { value: 'name', label: '按设备名称' },
]

export function HostsMatrixTab({
  activeGroupId,
  initialStatusFilter,
  onSelectGroup,
  onSelectHost,
  onBatchMaintenance,
}: HostsMatrixTabProps) {
  const canCreateGroup = usePermission(Permission.DEVICES_CREATE)
  const canUpdateDevices = usePermission(Permission.DEVICES_UPDATE)
  const canDeleteGroup = usePermission(Permission.DEVICES_DELETE)
  const canControlMonitoring = usePermission(Permission.MONITORING_CONTROL)

  const state = useMonitoringHosts({
    activeGroupId,
    initialStatusFilter,
  })

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const data = state.hostsQuery.data
  const items = data?.items ?? []

  const handleToggleSelect = (deviceId: number) => {
    setSelectedIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    )
  }

  const handleToggleSelectAllPage = (checked: boolean) => {
    const pageIds = items.map((item) => item.id)
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])))
    } else {
      const pageSet = new Set(pageIds)
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)))
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <GroupTreeSidebar
        groups={state.groups}
        activeGroupId={activeGroupId}
        onSelectGroup={onSelectGroup}
        canCreateGroup={canCreateGroup}
        canUpdateGroup={canUpdateDevices}
        canDeleteGroup={canDeleteGroup}
      />

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="设备状态过滤">
            {STATUS_PILLS.map((pill) => {
              const active = state.status === pill.value
              return (
                <button
                  key={pill.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => state.setStatus(pill.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {pill.label}
                </button>
              )
            })}

            <button
              type="button"
              aria-pressed={state.pinnedOnly}
              onClick={() => state.setPinnedOnly(!state.pinnedOnly)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                state.pinnedOnly
                  ? 'border-warning bg-warning-soft text-warning-soft-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star className={`h-3 w-3 ${state.pinnedOnly ? 'fill-current' : ''}`} />
              仅看关注
            </button>

            <button
              type="button"
              aria-pressed={state.problemOnly}
              onClick={() => state.setProblemOnly(!state.problemOnly)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                state.problemOnly
                  ? 'border-danger bg-danger-soft text-danger-soft-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertCircle className="h-3 w-3" />
              仅看异常
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={state.search}
                onChange={(e) => state.setSearch(e.target.value)}
                placeholder="搜索设备名、IP 或型号..."
                aria-label="搜索设备"
                className="h-8 w-52 rounded-lg border border-input bg-surface-2/50 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <select
              aria-label="排序方式"
              value={state.sortBy}
              onChange={(e) => state.setSortBy(e.target.value)}
              className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <HostBatchBar
          selectedIds={selectedIds}
          groups={state.groups}
          submitting={state.isMutating}
          canUpdateDevices={canUpdateDevices}
          canControlMonitoring={canControlMonitoring}
          onClearSelection={() => setSelectedIds([])}
          onBatchPin={(action, ids) => state.batchPin({ action, deviceIds: ids })}
          onBatchMoveToGroup={(ids, gid) =>
            state.batchMoveToGroup({ deviceIds: ids, groupId: gid })
          }
          onBatchAddMaintenance={(payload) => state.batchAddMaintenance(payload)}
          onBatchMaintenance={onBatchMaintenance}
        />

        <HostsMatrixTable
          items={items}
          total={data?.total ?? 0}
          page={data?.page ?? state.page}
          pageSize={data?.page_size ?? state.pageSize}
          totalPages={data?.total_pages ?? 1}
          isLoading={state.hostsQuery.isLoading}
          isError={state.hostsQuery.isError}
          errorMessage={state.hostsQuery.error?.message}
          permissions={data?.permissions}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAllPage={handleToggleSelectAllPage}
          onTogglePin={(deviceId, pinned) => state.togglePin({ deviceId, pinned })}
          onSelectHost={onSelectHost}
          onPageChange={state.setPage}
          onPageSizeChange={state.setPageSize}
        />
      </div>
    </div>
  )
}
