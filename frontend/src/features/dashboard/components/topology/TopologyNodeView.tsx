import React from 'react'

import { cn } from '@/utils/cn'
import type { TopologyNode, TopologyPoint } from '../../types'
import { NODE_H, NODE_W } from '../../utils/topologyLayout'
import { ROLE_LABELS, type NodeRole } from '../../utils/topologyRoles'
import {
  getDeviceTypeLabel,
  getDeviceVisualMetaByType,
  getTopologyNodeStatusMeta,
  iconMap,
} from './deviceVisualMeta'

interface TopologyNodeViewProps {
  node: TopologyNode
  role: NodeRole | undefined
  position: TopologyPoint
  selected: boolean
  draggable: boolean
  onSelect: (id: number) => void
  onDragStart: (id: number, event: React.PointerEvent<SVGGElement>) => void
}

const ICON_SIZE = 32

// 节点展示类型：SNMP 识别优先，缺失退回台账
const displayTypeOf = (node: TopologyNode) => node.detectedType ?? node.deviceType

// 名称过长会盖到相邻节点，按节点宽度截断
const truncateLabel = (label: string, max = 12) =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label

export const TopologyNodeView: React.FC<TopologyNodeViewProps> = ({
  node,
  role,
  position,
  selected,
  draggable,
  onSelect,
  onDragStart,
}) => {
  const meta = getDeviceVisualMetaByType(displayTypeOf(node))
  const statusMeta = getTopologyNodeStatusMeta(node.status)
  const Icon = iconMap[meta.icon]
  const typeLabel = getDeviceTypeLabel(displayTypeOf(node))
  const roleLabel = role ? ROLE_LABELS[role.role] : ''

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`设备节点 ${node.name}`}
      aria-pressed={selected}
      transform={`translate(${position.x}, ${position.y})`}
      className={cn('group outline-none', draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
      onPointerDown={(event) => onDragStart(node.id, event)}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(node.id)
        }
      }}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={16}
        strokeWidth={selected ? 3 : 1.5}
        className={cn(
          'fill-card transition-all duration-300 group-hover:drop-shadow-lg',
          selected ? 'stroke-blue-500' : meta.strokeClassName
        )}
      />
      <Icon
        x={(NODE_W - ICON_SIZE) / 2}
        y={14}
        width={ICON_SIZE}
        height={ICON_SIZE}
        className={cn('transition-transform duration-300 group-hover:scale-110', meta.iconClassName)}
        aria-hidden
      />
      <circle cx={NODE_W - 12} cy={12} r={4} className={statusMeta.dotClassName} />
      <text
        x={NODE_W / 2}
        y={62}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {truncateLabel(node.name)}
      </text>
      <text
        x={NODE_W / 2}
        y={78}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px]"
      >
        {typeLabel}
      </text>
      <title>{`${node.name} (${node.ip}) · ${typeLabel}${roleLabel ? ` · ${roleLabel}` : ''} · ${statusMeta.label}`}</title>
    </g>
  )
}
