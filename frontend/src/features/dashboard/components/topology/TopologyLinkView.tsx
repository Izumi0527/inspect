import React from 'react'

import { cn } from '@/utils/cn'
import type { TopologyLink, TopologyPoint } from '../../types'
import {
  PORT_LABEL_CHAR_W,
  PORT_LABEL_HEIGHT,
  PORT_LABEL_PAD,
  type LinkGeometryResult,
} from '../../utils/topologyLinkGeometry'
import { abbreviatePort } from '../../utils/topologyPorts'

interface TopologyLinkLayerProps {
  link: TopologyLink
  geometry: LinkGeometryResult
  highlighted: boolean
}

export interface TopologyLinkPathProps extends TopologyLinkLayerProps {
  up: boolean
}

export const PortLabel: React.FC<{ at: TopologyPoint; port: string; highlighted: boolean }> = ({
  at,
  port,
  highlighted,
}) => {
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
        className={cn(
          'fill-card transition-colors duration-200',
          highlighted ? 'stroke-blue-500' : 'stroke-border'
        )}
        strokeWidth={1}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          'font-mono text-[9px]',
          highlighted ? 'fill-foreground font-medium' : 'fill-muted-foreground'
        )}
      >
        {short}
      </text>
    </g>
  )
}

export const TopologyLinkPath: React.FC<TopologyLinkPathProps> = ({
  link,
  geometry,
  up,
  highlighted,
}) => (
  <path
    data-testid="topology-link"
    data-link-id={link.id}
    data-bidirectional={link.bidirectional ? 'true' : 'false'}
    data-curved={geometry.curved ? 'true' : 'false'}
    d={geometry.d}
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
)

export const TopologyLinkPorts: React.FC<TopologyLinkLayerProps> = ({
  link,
  geometry,
  highlighted,
}) => (
  <>
    <PortLabel at={geometry.sourceAt} port={link.sourcePort} highlighted={highlighted} />
    <PortLabel at={geometry.targetAt} port={link.targetPort} highlighted={highlighted} />
  </>
)
