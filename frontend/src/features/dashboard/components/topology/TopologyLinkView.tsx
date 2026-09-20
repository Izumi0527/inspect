import React from 'react'

import { cn } from '@/utils/cn'
import type { TopologyLink, TopologyPoint } from '../../types'
import { NODE_W } from '../../utils/topologyLayout'
import { abbreviatePort } from '../../utils/topologyPorts'

interface TopologyLinkViewProps {
  link: TopologyLink
  // 两端节点中心
  from: TopologyPoint
  to: TopologyPoint
  // 同层链路画弧线，避免直线穿过同一行里夹在中间的节点
  sameTier: boolean
  up: boolean
  highlighted: boolean
  // 该端节点上这是第几条链路：扇出多条时标签按此错开距离，不叠在一起
  sourceSlot: number
  targetSlot: number
}

// 接口标签离节点中心的基准距离：要越过 96px 方形节点的半对角线（68），斜向链路的标签才不被节点角盖住
const PORT_LABEL_OFFSET = Math.ceil(Math.hypot(NODE_W, NODE_W) / 2) + 10
// 同一节点上多条链路的标签逐条外推，三档循环
const PORT_LABEL_STAGGER = 18
const PORT_LABEL_SLOTS = 3
const PORT_LABEL_HEIGHT = 14
const PORT_LABEL_CHAR_W = 5.6
const PORT_LABEL_PAD = 8

const quadPoint = (a: TopologyPoint, c: TopologyPoint, b: TopologyPoint, t: number): TopologyPoint => {
  const mt = 1 - t
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  }
}

const lerp = (a: TopologyPoint, b: TopologyPoint, t: number): TopologyPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const PortLabel: React.FC<{ at: TopologyPoint; port: string }> = ({ at, port }) => {
  const short = abbreviatePort(port)
  if (short === '') return null
  const width = short.length * PORT_LABEL_CHAR_W + PORT_LABEL_PAD
  return (
    <g transform={`translate(${at.x}, ${at.y})`} data-testid="topology-link-port" pointerEvents="none">
      <rect
        x={-width / 2}
        y={-PORT_LABEL_HEIGHT / 2}
        width={width}
        height={PORT_LABEL_HEIGHT}
        rx={4}
        className="fill-card stroke-border"
        strokeWidth={1}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted-foreground font-mono text-[9px]"
      >
        {short}
      </text>
    </g>
  )
}

export const TopologyLinkView: React.FC<TopologyLinkViewProps> = ({
  link,
  from,
  to,
  sameTier,
  up,
  highlighted,
  sourceSlot,
  targetSlot,
}) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const chord = Math.max(1, Math.hypot(dx, dy))
  // 标签在路径上的参数位置：按弦长折算，短链路时收到两端各占不到一半
  const offsetFor = (slot: number) => PORT_LABEL_OFFSET + (slot % PORT_LABEL_SLOTS) * PORT_LABEL_STAGGER
  const tSource = Math.min(0.45, offsetFor(sourceSlot) / chord)
  const tTarget = Math.min(0.45, offsetFor(targetSlot) / chord)

  let d: string
  let sourceAt: TopologyPoint
  let targetAt: TopologyPoint
  if (sameTier) {
    const bow = Math.min(160, Math.max(48, chord * 0.3))
    const control = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + bow }
    d = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`
    sourceAt = quadPoint(from, control, to, tSource)
    targetAt = quadPoint(from, control, to, 1 - tTarget)
  } else {
    d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    sourceAt = lerp(from, to, tSource)
    targetAt = lerp(from, to, 1 - tTarget)
  }

  return (
    <g>
      <path
        data-testid="topology-link"
        data-link-id={link.id}
        data-bidirectional={link.bidirectional ? 'true' : 'false'}
        data-curved={sameTier ? 'true' : 'false'}
        d={d}
        fill="none"
        strokeWidth={link.bidirectional ? 2.5 : 1.5}
        strokeDasharray={link.bidirectional ? undefined : '6 4'}
        strokeLinecap="round"
        className={cn(
          'transition-colors duration-300',
          up ? 'stroke-emerald-500/70' : 'stroke-muted-foreground/40',
          highlighted && 'stroke-blue-500'
        )}
      >
        <title>{`${link.sourcePort || '未知端口'} ↔ ${link.targetPort || '未知端口'}${link.bidirectional ? '' : '（仅单侧可见）'}`}</title>
      </path>
      <PortLabel at={sourceAt} port={link.sourcePort} />
      <PortLabel at={targetAt} port={link.targetPort} />
    </g>
  )
}
