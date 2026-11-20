'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react'
import { DEVICE_GROUPS_QUERY_KEY } from '@/features/devices/api/devices.api'
import { DeviceGroupModal } from '@/features/devices/components/DeviceGroupModal'
import {
  buildDeviceGroupTree,
  type DeviceGroupTreeNode,
} from '@/features/devices/utils/deviceGroupTree'
import type { DeviceGroupItem } from '@/features/devices/types'
import { MONITORING_HOSTS_QUERY_KEY } from '../../hooks/useMonitoringHosts'

export interface GroupTreeSidebarProps {
  groups: DeviceGroupItem[]
  activeGroupId: number | null
  onSelectGroup: (groupId: number | null) => void
  canCreateGroup: boolean
  canUpdateGroup: boolean
  canDeleteGroup: boolean
}

function filterTreeByKeyword(
  nodes: DeviceGroupTreeNode[],
  keyword: string
): DeviceGroupTreeNode[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return nodes
  const result: DeviceGroupTreeNode[] = []
  for (const node of nodes) {
    const filteredChildren = filterTreeByKeyword(node.children, q)
    const selfMatched = node.group.name.toLowerCase().includes(q)
    if (selfMatched || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren,
      })
    }
  }
  return result
}

interface TreeNodeRowProps {
  node: DeviceGroupTreeNode
  activeGroupId: number | null
  expandedIds: Set<number>
  forceExpand: boolean
  onToggleExpand: (id: number) => void
  onSelectGroup: (groupId: number | null) => void
}

function TreeNodeRow({
  node,
  activeGroupId,
  expandedIds,
  forceExpand,
  onToggleExpand,
  onSelectGroup,
}: TreeNodeRowProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = forceExpand || expandedIds.has(node.group.id)
  const isSelected = activeGroupId === node.group.id
  const hasAnomaly =
    node.group.alert_count > 0 || node.group.online_count < node.group.device_count

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md py-1.5 pr-2 text-xs transition-colors ${
          isSelected
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-foreground hover:bg-accent'
        }`}
        style={{ paddingLeft: `${6 + (node.depth - 1) * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `折叠 ${node.group.name}` : `展开 ${node.group.name}`}
            onClick={() => onToggleExpand(node.group.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelectGroup(isSelected ? null : node.group.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-1.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {hasAnomaly && (
              <span
                aria-label="组内存在异常设备"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
              />
            )}
            <span className="truncate">{node.group.name}</span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {node.group.device_count}
          </span>
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.group.id}
              node={child}
              activeGroupId={activeGroupId}
              expandedIds={expandedIds}
              forceExpand={forceExpand}
              onToggleExpand={onToggleExpand}
              onSelectGroup={onSelectGroup}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function GroupTreeSidebar({
  groups,
  activeGroupId,
  onSelectGroup,
  canCreateGroup,
  canUpdateGroup,
  canDeleteGroup,
}: GroupTreeSidebarProps) {
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set())

  const treeNodes = useMemo(() => buildDeviceGroupTree(groups), [groups])
  const visibleNodes = useMemo(
    () => filterTreeByKeyword(treeNodes, search),
    [treeNodes, search]
  )
  const totalDevices = useMemo(
    () => groups.reduce((acc, g) => (g.parent_id === null ? acc + g.device_count : acc), 0),
    [groups]
  )

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (collapsed) {
    return (
      <aside
        aria-label="设备分组树导航"
        className="flex shrink-0 flex-col items-center rounded-xl border border-border bg-card p-2"
      >
        <button
          type="button"
          aria-label="展开分组树"
          onClick={() => setCollapsed(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <>
      <aside
        aria-label="设备分组树导航"
        className="flex w-full shrink-0 flex-col rounded-xl border border-border bg-card p-3 lg:w-64"
      >
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <FolderTree className="h-4 w-4 text-primary" />
            <span>设备分组</span>
          </div>
          <div className="flex items-center gap-1">
            {(canCreateGroup || canUpdateGroup) && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent"
              >
                <FolderPlus className="h-3 w-3" />
                <span>+ 新建分组</span>
              </button>
            )}
            <button
              type="button"
              aria-label="收起分组树"
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索分组..."
            aria-label="搜索分组"
            className="h-7 w-full rounded-md border border-input bg-surface-2/60 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="button"
          onClick={() => onSelectGroup(null)}
          className={`mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
            activeGroupId === null
              ? 'bg-primary/10 font-semibold text-primary'
              : 'text-foreground hover:bg-accent'
          }`}
        >
          <span>全部分组</span>
          {totalDevices > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {totalDevices}
            </span>
          )}
        </button>

        <div className="max-h-[460px] space-y-0.5 overflow-y-auto">
          {visibleNodes.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              {search.trim() ? '未找到匹配分组' : '暂无设备分组'}
            </p>
          ) : (
            visibleNodes.map((node) => (
              <TreeNodeRow
                key={node.group.id}
                node={node}
                activeGroupId={activeGroupId}
                expandedIds={expandedIds}
                forceExpand={search.trim().length > 0}
                onToggleExpand={toggleExpand}
                onSelectGroup={onSelectGroup}
              />
            ))
          )}
        </div>
      </aside>

      <DeviceGroupModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        canCreate={canCreateGroup}
        canUpdate={canUpdateGroup}
        canDelete={canDeleteGroup}
        onMutated={() => {
          void queryClient.invalidateQueries({ queryKey: DEVICE_GROUPS_QUERY_KEY })
          void queryClient.invalidateQueries({ queryKey: [MONITORING_HOSTS_QUERY_KEY] })
        }}
      />
    </>
  )
}
