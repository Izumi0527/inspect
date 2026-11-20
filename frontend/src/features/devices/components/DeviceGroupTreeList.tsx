'use client'

import React from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { Badge, Button } from '@/components/atoms'
import type { DeviceGroupItem } from '../types'
import type { DeviceGroupTreeNode } from '../utils/deviceGroupTree'

interface DeviceGroupTreeListProps {
  nodes: DeviceGroupTreeNode[]
  isLoading: boolean
  isError: boolean
  errorMessage: string
  canUpdate: boolean
  canDelete: boolean
  deleting: boolean
  onEdit: (group: DeviceGroupItem) => void
  onDelete: (group: DeviceGroupItem) => void
}

export const DeviceGroupTreeList: React.FC<DeviceGroupTreeListProps> = ({
  nodes,
  isLoading,
  isError,
  errorMessage,
  canUpdate,
  canDelete,
  deleting,
  onEdit,
  onDelete,
}) => {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        正在加载设备分组...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger-soft-foreground">
        {errorMessage}
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        暂无设备分组，点击上方「新建分组」创建。
      </div>
    )
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {nodes.map(({ group, depth }) => (
        <div
          key={group.id}
          className="flex items-center justify-between gap-3 px-3 py-2.5"
          style={{ paddingLeft: `${12 + (depth - 1) * 20}px` }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
              <Badge variant="secondary" size="sm" className="tabular-nums">
                L{depth}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {group.device_count} 台设备 · {group.online_count} 在线
              </span>
              {!group.alerts_limited_by_permission && group.alert_count > 0 && (
                <Badge variant="error" size="sm" className="tabular-nums">
                  {group.alert_count} 告警
                </Badge>
              )}
            </div>
            {group.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`编辑分组 ${group.name}`}
                onClick={() => onEdit(group)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                aria-label={`删除分组 ${group.name}`}
                onClick={() => onDelete(group)}
              >
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
