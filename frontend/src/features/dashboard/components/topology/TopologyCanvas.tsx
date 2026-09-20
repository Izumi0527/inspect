import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

import { Button } from '@/components/atoms'
import { cn } from '@/utils/cn'
import type { NetworkTopology, TopologyLink, TopologyPoint, TopologyViewport } from '../../types'
import { GAP_Y, NODE_H, NODE_W, type TopologyLayout } from '../../utils/topologyLayout'
import type { NodeRole } from '../../utils/topologyRoles'
import { TopologyLinkView } from './TopologyLinkView'
import { TopologyNodeView } from './TopologyNodeView'

interface TopologyCanvasProps {
  topology: NetworkTopology
  autoLayout: TopologyLayout
  positions: Map<number, TopologyPoint>
  roles: Map<number, NodeRole>
  selectedId: number | null
  onSelect: (id: number) => void
  // null 表示自动适应画布
  viewport: TopologyViewport | null
  onViewportChange: (viewport: TopologyViewport | null) => void
  canEdit: boolean
  onNodeMove: (id: number, point: TopologyPoint) => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
// 自动适应时不放大超过此倍数，几台设备的小拓扑不该被拉成巨型图标
const FIT_MAX_ZOOM = 1.25
const FIT_PADDING = 32
// 层级标签画在自动布局的左侧，适应画布时要把它算进包围盒
const TIER_LABEL_GUTTER = 88
// 位移小于此值视为点击而不是拖动
const DRAG_THRESHOLD = 3
// jsdom 与首帧测不到尺寸时的兜底
const FALLBACK_SIZE = { width: 800, height: 480 }

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

type DragState =
  | { kind: 'pan'; startClient: TopologyPoint; startViewport: TopologyViewport }
  | { kind: 'node'; id: number; startClient: TopologyPoint; startPosition: TopologyPoint; moved: boolean }

const useElementSize = (ref: React.RefObject<SVGSVGElement | null>) => {
  const [size, setSize] = useState(FALLBACK_SIZE)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (width > 0 && height > 0) setSize({ width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  topology,
  autoLayout,
  positions,
  roles,
  selectedId,
  onSelect,
  viewport,
  onViewportChange,
  canEdit,
  onNodeMove,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const size = useElementSize(svgRef)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)

  const nodeById = useMemo(() => new Map(topology.nodes.map((node) => [node.id, node])), [topology.nodes])
  const tierById = useMemo(() => new Map(autoLayout.nodes.map((node) => [node.id, node.tier])), [autoLayout.nodes])

  // 每条链路在其两端节点上的序号：同一节点扇出多条链路时，接口标签按序号错开距离
  const linkSlots = useMemo(() => {
    const countByNode = new Map<number, number>()
    const next = (id: number) => {
      const slot = countByNode.get(id) ?? 0
      countByNode.set(id, slot + 1)
      return slot
    }
    return new Map(topology.links.map((link) => [link.id, { source: next(link.source), target: next(link.target) }]))
  }, [topology.links])

  // 包围盒：所有节点 + 左侧层级标签
  const bounds = useMemo(() => {
    let minX = -TIER_LABEL_GUTTER
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of positions.values()) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x + NODE_W)
      maxY = Math.max(maxY, point.y + NODE_H)
    }
    if (!Number.isFinite(minY)) return { minX: 0, minY: 0, width: 1, height: 1 }
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }, [positions])

  const fitViewport = useMemo<TopologyViewport>(() => {
    const k = clampZoom(
      Math.min(
        FIT_MAX_ZOOM,
        (size.width - FIT_PADDING * 2) / bounds.width,
        (size.height - FIT_PADDING * 2) / bounds.height
      )
    )
    return {
      k,
      x: (size.width - bounds.width * k) / 2 - bounds.minX * k,
      y: (size.height - bounds.height * k) / 2 - bounds.minY * k,
    }
  }, [bounds, size])

  const effective = viewport ?? fitViewport

  const zoomAt = useCallback(
    (factor: number, pivot: TopologyPoint) => {
      const next = clampZoom(effective.k * factor)
      const ratio = next / effective.k
      onViewportChange({
        k: next,
        x: pivot.x - (pivot.x - effective.x) * ratio,
        y: pivot.y - (pivot.y - effective.y) * ratio,
      })
    },
    [effective, onViewportChange]
  )

  // React 把 wheel 注册为 passive，preventDefault 无效；要挡住页面滚动必须挂原生非 passive 监听
  useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.kind === 'node' && drag.moved) {
      // 拖动结束时浏览器可能紧接着给节点派发一个 click（pointerup 仍落在节点上），要吞掉它；
      // 但 pointerup 落在节点外就没有这个 click，标记必须在本轮事件结束后自动清掉，
      // 否则会吞掉用户下一次真正的点击
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = event.clientX - drag.startClient.x
      const dy = event.clientY - drag.startClient.y
      if (drag.kind === 'pan') {
        onViewportChange({
          k: drag.startViewport.k,
          x: drag.startViewport.x + dx,
          y: drag.startViewport.y + dy,
        })
        return
      }
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      onNodeMove(drag.id, {
        x: drag.startPosition.x + dx / effective.k,
        y: drag.startPosition.y + dy / effective.k,
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [effective.k, endDrag, onNodeMove, onViewportChange])

  // 自动适应的视口会随节点包围盒重算：拖动一开始就把它冻结成显式视口，否则拖动时画布跟着漂移
  const freezeViewport = () => {
    if (viewport === null) onViewportChange(effective)
  }

  const startPan = (event: React.PointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return
    freezeViewport()
    dragRef.current = {
      kind: 'pan',
      startClient: { x: event.clientX, y: event.clientY },
      startViewport: effective,
    }
  }

  const startNodeDrag = (id: number, event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation()
    if (!canEdit || event.button !== 0) return
    const position = positions.get(id)
    if (!position) return
    freezeViewport()
    dragRef.current = {
      kind: 'node',
      id,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition: position,
      moved: false,
    }
  }

  const handleSelect = (id: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(id)
  }

  const centerOf = (point: TopologyPoint): TopologyPoint => ({ x: point.x + NODE_W / 2, y: point.y + NODE_H / 2 })
  const isLinkUp = (link: TopologyLink) =>
    nodeById.get(link.source)?.status === 'online' && nodeById.get(link.target)?.status === 'online'
  const isHighlighted = (link: TopologyLink) =>
    selectedId !== null && (link.source === selectedId || link.target === selectedId)

  const zoomButtons: Array<{ label: string; icon: React.ElementType; onClick: () => void }> = [
    { label: '放大', icon: Plus, onClick: () => zoomAt(ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }) },
    { label: '缩小', icon: Minus, onClick: () => zoomAt(1 / ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }) },
    { label: '适应画布', icon: Maximize2, onClick: () => onViewportChange(null) },
  ]

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <svg
        ref={svgRef}
        className="block h-full w-full touch-none select-none"
        role="img"
        aria-label="网络拓扑图"
      >
        <defs>
          <pattern id="topology-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} className="fill-border/70" />
          </pattern>
        </defs>
        <rect
          data-testid="topology-canvas-bg"
          width="100%"
          height="100%"
          fill="url(#topology-grid)"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={startPan}
        />
        <g
          data-testid="topology-viewport"
          transform={`translate(${effective.x}, ${effective.y}) scale(${effective.k})`}
        >
          {autoLayout.tiers.map((band, index) => (
            <g key={band.tier}>
              {index > 0 && (
                <line
                  x1={-TIER_LABEL_GUTTER}
                  x2={autoLayout.width + 24}
                  y1={band.y - GAP_Y / 2}
                  y2={band.y - GAP_Y / 2}
                  strokeDasharray="4 6"
                  className="stroke-border"
                />
              )}
              <text
                data-testid="topology-tier-label"
                x={-16}
                y={band.y + NODE_H / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-muted-foreground text-[11px] font-medium"
              >
                {band.label}
              </text>
            </g>
          ))}

          {topology.links.map((link) => {
            const from = positions.get(link.source)
            const to = positions.get(link.target)
            if (!from || !to) return null
            const slots = linkSlots.get(link.id) ?? { source: 0, target: 0 }
            return (
              <TopologyLinkView
                key={link.id}
                link={link}
                from={centerOf(from)}
                to={centerOf(to)}
                sameTier={tierById.get(link.source) === tierById.get(link.target)}
                up={isLinkUp(link)}
                highlighted={isHighlighted(link)}
                sourceSlot={slots.source}
                targetSlot={slots.target}
              />
            )
          })}

          {topology.nodes.map((node) => {
            const position = positions.get(node.id)
            if (!position) return null
            return (
              <TopologyNodeView
                key={node.id}
                node={node}
                role={roles.get(node.id)}
                position={position}
                selected={node.id === selectedId}
                draggable={canEdit}
                onSelect={handleSelect}
                onDragStart={startNodeDrag}
              />
            )
          })}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {zoomButtons.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={cn('h-7 w-7 bg-card/90')}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
    </div>
  )
}
