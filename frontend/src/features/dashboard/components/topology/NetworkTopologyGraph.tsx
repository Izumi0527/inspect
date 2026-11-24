import React, { useMemo, useState } from 'react'
import { LayoutGrid, Save } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/atoms'
import { cn } from '@/utils/cn'
import { formatDateTimeYMDHM } from '@/utils/formatters'
import type { NetworkTopology } from '../../types'
import { useTopologyLayoutState } from '../../hooks/useTopologyLayoutState'
import { inferNodeRoles, ROLE_LABELS, type NetworkRole } from '../../utils/topologyRoles'
import { getTopologyNodeVisualMeta, iconMap } from './deviceVisualMeta'
import { EmptyLinksHint } from './EmptyLinksHint'
import { TopologyCanvas } from './TopologyCanvas'
import { TopologyNodeDetail } from './TopologyNodeDetail'

const SWITCH_LEGEND_ROLES: readonly NetworkRole[] = ['core', 'aggregation', 'access']

interface NetworkTopologyGraphProps {
  topology: NetworkTopology
  // 有 devices:update 的用户可拖动节点并保存共享布局；其他人只能平移缩放
  canEditLayout?: boolean
  focusDeviceId?: number | null
}

export const NetworkTopologyGraph: React.FC<NetworkTopologyGraphProps> = ({
  topology,
  canEditLayout = false,
  focusDeviceId = null,
}) => {
  const layoutState = useTopologyLayoutState(topology)
  const roles = useMemo(() => inferNodeRoles(topology), [topology])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const appliedFocusIdRef = React.useRef<number | null>(null)

  const nodeById = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    [topology.nodes]
  )

  React.useEffect(() => {
    if (focusDeviceId == null) {
      appliedFocusIdRef.current = null
      return
    }
    if (appliedFocusIdRef.current === focusDeviceId) {
      return
    }
    if (nodeById.has(focusDeviceId)) {
      appliedFocusIdRef.current = focusDeviceId
      setSelectedId(focusDeviceId)
    }
  }, [focusDeviceId, nodeById])

  const selectedNode = selectedId !== null ? nodeById.get(selectedId) ?? null : null
  const selectedLinks = selectedNode
    ? topology.links.filter((link) => link.source === selectedNode.id || link.target === selectedNode.id)
    : []

  const switchLegendItems = useMemo(() => {
    const present = new Set<NetworkRole>()
    for (const node of topology.nodes) {
      const type = (node.detectedType ?? node.deviceType).trim().toLowerCase()
      const role = roles.get(node.id)?.role
      if (type === 'switch' && role && SWITCH_LEGEND_ROLES.includes(role)) {
        present.add(role)
      }
    }
    return SWITCH_LEGEND_ROLES.filter((role) => present.has(role)).map((role) => ({
      role,
      label: ROLE_LABELS[role],
      meta: getTopologyNodeVisualMeta('switch', role),
    }))
  }, [topology.nodes, roles])

  if (topology.nodes.length === 0) {
    return null
  }

  const toggleSelect = (id: number) => setSelectedId((current) => (current === id ? null : id))

  const handleSave = async () => {
    try {
      await layoutState.save()
      toast.success('拓扑布局已保存')
    } catch (error) {
      toast.error(error instanceof Error && error.message ? `保存拓扑布局失败：${error.message}` : '保存拓扑布局失败')
    }
  }

  const savedHint = layoutState.dirty
    ? '有未保存的布局改动'
    : layoutState.savedMeta?.updatedAt
      ? `布局保存于 ${formatDateTimeYMDHM(layoutState.savedMeta.updatedAt)}${layoutState.savedMeta.updatedBy ? ` · ${layoutState.savedMeta.updatedBy}` : ''}`
      : '自动分层布局'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {topology.links.length === 0 && <EmptyLinksHint nodes={topology.nodes} />}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          拖动空白处平移 · 滚轮缩放
          {canEditLayout ? ' · 拖动节点调整位置' : ''}
          <span className="ml-2 text-muted-foreground/70">{savedHint}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              layoutState.resetLayout()
              layoutState.setViewport(null)
            }}
          >
            <LayoutGrid className="mr-1 h-3.5 w-3.5" />
            自动布局
          </Button>
          {canEditLayout && (
            <Button
              type="button"
              size="sm"
              disabled={!layoutState.dirty || layoutState.saving}
              onClick={handleSave}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              {layoutState.saving ? '保存中…' : '保存布局'}
            </Button>
          )}
        </div>
      </div>

      {switchLegendItems.length > 0 && (
        <div
          data-testid="topology-role-legend"
          className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
        >
          <span className="text-muted-foreground/80">交换机层级：</span>
          {switchLegendItems.map(({ role, label, meta }) => {
            const Icon = iconMap[meta.icon]
            return (
              <span key={role} className="inline-flex items-center gap-1.5">
                <Icon
                  className={cn('h-3.5 w-3.5', meta.iconClassName)}
                  strokeWidth={meta.strokeWidth}
                  aria-hidden
                />
                <span className="text-foreground/90">{label}</span>
              </span>
            )
          })}
        </div>
      )}

      <TopologyCanvas
        topology={topology}
        autoLayout={layoutState.autoLayout}
        positions={layoutState.positions}
        roles={roles}
        selectedId={selectedId}
        onSelect={toggleSelect}
        viewport={layoutState.viewport}
        onViewportChange={layoutState.setViewport}
        canEdit={canEditLayout}
        onNodeMove={layoutState.moveNode}
      />

      {selectedNode && (
        <TopologyNodeDetail
          node={selectedNode}
          role={roles.get(selectedNode.id)}
          links={selectedLinks}
          nodeById={nodeById}
        />
      )}
    </div>
  )
}
