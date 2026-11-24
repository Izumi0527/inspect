'use client'

import { useContext, useMemo, useState } from 'react'
import { QueryClientContext, useQuery } from '@tanstack/react-query'
import { FolderTree } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/atoms/popover'
import { DEVICE_GROUPS_QUERY_KEY, getDeviceGroups } from '@/features/devices/api/devices.api'
import type { DeviceGroupItem } from '@/features/devices/types'

interface GroupFilterSelectProps {
  activeGroupId: number | null
  onChange: (groupId: number | null) => void
}

interface FlatGroupOption {
  item: DeviceGroupItem
  depth: number
}

function flattenGroupTree(groups: DeviceGroupItem[]): FlatGroupOption[] {
  const childrenMap = new Map<number | null, DeviceGroupItem[]>()
  for (const g of groups) {
    const pid = g.parent_id ?? null
    const list = childrenMap.get(pid) ?? []
    list.push(g)
    childrenMap.set(pid, list)
  }
  const out: FlatGroupOption[] = []
  const visited = new Set<number>()

  const walk = (parentId: number | null, depth: number) => {
    const nodes = childrenMap.get(parentId) ?? []
    for (const node of nodes) {
      if (visited.has(node.id)) continue
      visited.add(node.id)
      out.push({ item: node, depth })
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  for (const g of groups) {
    if (!visited.has(g.id)) out.push({ item: g, depth: 0 })
  }
  return out
}

function GroupFilterSelectInner({
  activeGroupId,
  onChange,
}: GroupFilterSelectProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const { data: groups = [], isLoading } = useQuery({
    queryKey: DEVICE_GROUPS_QUERY_KEY,
    queryFn: getDeviceGroups,
    staleTime: 60_000,
    retry: 1,
  })

  const flatGroups = useMemo(() => flattenGroupTree(groups), [groups])
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId]
  )

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="设备分组筛选"
          className="inline-flex h-9 max-w-44 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-normal text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selectedGroup ? selectedGroup.name : '全部分组'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setPopoverOpen(false)
          }}
          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
            activeGroupId === null ? 'bg-accent font-medium text-foreground' : 'text-foreground'
          }`}
        >
          <span>全部分组</span>
        </button>
        <div className="my-1 h-px bg-border" />
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">加载分组中...</p>
          ) : flatGroups.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">暂无设备分组</p>
          ) : (
            flatGroups.map(({ item, depth }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id)
                  setPopoverOpen(false)
                }}
                style={{ paddingLeft: `${10 + depth * 12}px` }}
                className={`flex w-full items-center justify-between rounded-md py-1.5 pr-2.5 text-left text-sm transition-colors hover:bg-accent ${
                  activeGroupId === item.id
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-foreground'
                }`}
              >
                <span className="truncate">{item.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {item.device_count}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function GroupFilterSelect(props: GroupFilterSelectProps) {
  const queryClient = useContext(QueryClientContext)
  if (!queryClient) {
    return (
      <button
        type="button"
        aria-label="设备分组筛选"
        className="inline-flex h-9 max-w-44 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-normal text-foreground"
      >
        <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">全部分组</span>
      </button>
    )
  }
  return <GroupFilterSelectInner {...props} />
}
