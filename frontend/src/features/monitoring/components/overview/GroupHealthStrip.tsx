'use client'

import { FolderTree } from 'lucide-react'
import type { GroupSummaryItem } from '../../types/zabbix-monitoring.types'

interface GroupHealthStripProps {
  groups?: GroupSummaryItem[]
  activeGroupId: number | null
  onSelectGroup: (groupId: number | null) => void
}

export function GroupHealthStrip({
  groups = [],
  activeGroupId,
  onSelectGroup,
}: GroupHealthStripProps) {
  if (groups.length === 0) return null

  return (
    <section aria-label="设备分组健康速览" className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FolderTree className="h-3.5 w-3.5" />
          <span>分组健康速览（点击聚焦该分组）</span>
        </div>
        {activeGroupId !== null && (
          <button
            type="button"
            onClick={() => onSelectGroup(null)}
            className="text-xs font-medium text-primary hover:underline"
          >
            重置为全部分组
          </button>
        )}
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {groups.map((group) => {
          const isSelected = activeGroupId === group.group_id && group.group_id > 0
          const hasOffline = group.offline_devices > 0
          const hasWarning = group.warning_devices > 0
          const statusDotClass = hasOffline
            ? 'bg-danger'
            : hasWarning
              ? 'bg-warning'
              : 'bg-success'

          return (
            <button
              key={`${group.group_id}-${group.group_name}`}
              type="button"
              disabled={group.group_id <= 0}
              onClick={() =>
                group.group_id > 0 &&
                onSelectGroup(isSelected ? null : group.group_id)
              }
              className={`min-w-44 shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-surface-3/60'
                  : 'border-border bg-card hover:bg-accent/60'
              } disabled:cursor-default disabled:opacity-80`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {group.group_name}
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  设备 {group.online_devices}/{group.total_devices}
                </span>
                <span>
                  {hasOffline
                    ? `离线 ${group.offline_devices}`
                    : hasWarning
                      ? `告警 ${group.warning_devices}`
                      : '运行平稳'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>峰值 CPU {group.max_cpu.toFixed(1)}%</span>
                <span>内存 {group.max_memory.toFixed(1)}%</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
