import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  NetworkTopology,
  SavedTopologyLayout,
  TopologyNodePosition,
  TopologyPoint,
  TopologyViewport,
} from '../types'
import { layoutTopology, type TopologyLayout } from '../utils/topologyLayout'
import { saveTopologyLayout } from '../api/dashboard.api'

type PositionMap = Map<number, TopologyPoint>

const toPositionMap = (positions: TopologyNodePosition[] | undefined): PositionMap =>
  new Map((positions ?? []).map(({ deviceId, x, y }) => [deviceId, { x, y }]))

// 只比较仍在拓扑里的设备：已下线设备的旧坐标不算「未保存改动」
const positionsEqual = (a: PositionMap, b: PositionMap, ids: Iterable<number>) => {
  for (const id of ids) {
    const pa = a.get(id)
    const pb = b.get(id)
    if (pa === undefined && pb === undefined) continue
    if (pa === undefined || pb === undefined) return false
    if (pa.x !== pb.x || pa.y !== pb.y) return false
  }
  return true
}

// 服务端布局的内容键：只有坐标或视口真的变了（别人保存了新布局）才重新播种本地状态。
// 不能用 updated_at：保存响应与随后 GET 回来的时间戳精度可能不同，会把自己刚保存的布局误判成
// 别人改的，从而吞掉之后的本地拖动；用内容比较则天然幂等。
const savedLayoutKey = (layout: SavedTopologyLayout | undefined) =>
  layout
    ? JSON.stringify({
        positions: [...layout.positions].sort((a, b) => a.deviceId - b.deviceId),
        viewport: layout.viewport ?? null,
      })
    : ''

export interface TopologyLayoutState {
  autoLayout: TopologyLayout
  // 当前生效的坐标：自动布局被用户坐标覆盖后的结果
  positions: PositionMap
  // null 表示由画布自动适应
  viewport: TopologyViewport | null
  setViewport: (viewport: TopologyViewport | null) => void
  dirty: boolean
  saving: boolean
  savedMeta: { updatedAt?: string; updatedBy?: string } | null
  moveNode: (id: number, point: TopologyPoint) => void
  resetLayout: () => void
  save: () => Promise<SavedTopologyLayout>
}

export function useTopologyLayoutState(topology: NetworkTopology): TopologyLayoutState {
  const autoLayout = useMemo(() => layoutTopology(topology), [topology])
  const nodeIds = useMemo(() => topology.nodes.map((node) => node.id), [topology.nodes])

  const [overrides, setOverrides] = useState<PositionMap>(() => toPositionMap(topology.layout?.positions))
  const [baseline, setBaseline] = useState<PositionMap>(() => toPositionMap(topology.layout?.positions))
  const [viewport, setViewport] = useState<TopologyViewport | null>(topology.layout?.viewport ?? null)
  const [savedMeta, setSavedMeta] = useState(() =>
    topology.layout ? { updatedAt: topology.layout.updatedAt, updatedBy: topology.layout.updatedBy } : null
  )
  const [saving, setSaving] = useState(false)

  const seededKey = useRef(savedLayoutKey(topology.layout))
  useEffect(() => {
    const key = savedLayoutKey(topology.layout)
    if (key === seededKey.current) return
    seededKey.current = key
    const saved = toPositionMap(topology.layout?.positions)
    setOverrides(saved)
    setBaseline(saved)
    setViewport(topology.layout?.viewport ?? null)
    setSavedMeta(topology.layout ? { updatedAt: topology.layout.updatedAt, updatedBy: topology.layout.updatedBy } : null)
  }, [topology.layout])

  const positions = useMemo<PositionMap>(() => {
    const merged: PositionMap = new Map()
    for (const layoutNode of autoLayout.nodes) {
      merged.set(layoutNode.id, overrides.get(layoutNode.id) ?? { x: layoutNode.x, y: layoutNode.y })
    }
    return merged
  }, [autoLayout, overrides])

  const dirty = !positionsEqual(overrides, baseline, nodeIds)

  const moveNode = useCallback((id: number, point: TopologyPoint) => {
    setOverrides((current) => new Map(current).set(id, point))
  }, [])

  const resetLayout = useCallback(() => {
    setOverrides(new Map())
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const saved = await saveTopologyLayout({
        positions: nodeIds.map((deviceId) => ({ deviceId, ...positions.get(deviceId)! })),
        ...(viewport ? { viewport } : {}),
      })
      const savedPositions = toPositionMap(saved.positions)
      setOverrides(savedPositions)
      setBaseline(savedPositions)
      setSavedMeta({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy })
      seededKey.current = savedLayoutKey(saved)
      return saved
    } finally {
      setSaving(false)
    }
  }, [nodeIds, positions, viewport])

  return {
    autoLayout,
    positions,
    viewport,
    setViewport,
    dirty,
    saving,
    savedMeta,
    moveNode,
    resetLayout,
    save,
  }
}
