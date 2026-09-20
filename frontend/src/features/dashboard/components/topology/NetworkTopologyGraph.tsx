import React, { useMemo, useState } from 'react'
import { LayoutGrid, Save } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/atoms'
import { formatDateTimeYMDHM } from '@/utils/formatters'
import type { NetworkTopology } from '../../types'
import { useTopologyLayoutState } from '../../hooks/useTopologyLayoutState'
import { inferNodeRoles } from '../../utils/topologyRoles'
import { EmptyLinksHint } from './EmptyLinksHint'
import { TopologyCanvas } from './TopologyCanvas'
import { TopologyNodeDetail } from './TopologyNodeDetail'

interface NetworkTopologyGraphProps {
  topology: NetworkTopology
  // 有 devices:update 的用户可拖动节点并保存共享布局；其他人只能平移缩放
  canEditLayout?: boolean
}

export const NetworkTopologyGraph: React.FC<NetworkTopologyGraphProps> = ({ topology, canEditLayout = false }) => {
  const layoutState = useTopologyLayoutState(topology)
  const roles = useMemo(() => inferNodeRoles(topology), [topology])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const nodeById = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    [topology.nodes]
  )

  const selectedNode = selectedId !== null ? nodeById.get(selectedId) ?? null : null
  const selectedLinks = selectedNode
    ? topology.links.filter((link) => link.source === selectedNode.id || link.target === selectedNode.id)
    : []

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
