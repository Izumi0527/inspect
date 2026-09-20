import React from 'react'

import { cn } from '@/utils/cn'
import type { TopologyLink, TopologyNode } from '../../types'
import { ROLE_LABELS, ROLE_SOURCE_LABELS, type NodeRole } from '../../utils/topologyRoles'
import { getDeviceTypeLabel, getTopologyLLDPStatusMeta, getTopologyNodeStatusMeta } from './deviceVisualMeta'

interface TopologyNodeDetailProps {
  node: TopologyNode
  role: NodeRole | undefined
  links: TopologyLink[]
  nodeById: Map<number, TopologyNode>
}

export const TopologyNodeDetail: React.FC<TopologyNodeDetailProps> = ({ node, role, links, nodeById }) => {
  const statusMeta = getTopologyNodeStatusMeta(node.status)
  const lldpMeta = getTopologyLLDPStatusMeta(node.lldpStatus)

  return (
    <div
      data-testid="topology-node-detail"
      className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-foreground">{node.name}</span>
        <span className="text-muted-foreground">{node.ip}</span>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            statusMeta.badgeClassName
          )}
        >
          {statusMeta.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {node.detectedType ? (
          <>
            <div className="text-muted-foreground">
              SNMP 识别：<span className="text-foreground">{getDeviceTypeLabel(node.detectedType)}</span>
            </div>
            <div className="text-muted-foreground">
              档案类型：<span className="text-foreground">{getDeviceTypeLabel(node.deviceType)}</span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            档案类型：<span className="text-foreground">{getDeviceTypeLabel(node.deviceType)}</span>
            <span className="ml-1">（SNMP 未识别）</span>
          </div>
        )}
        {role && (
          <div className="text-muted-foreground">
            层级：<span className="text-foreground">{ROLE_LABELS[role.role]}</span>
            <span className="ml-1">（{ROLE_SOURCE_LABELS[role.source]}）</span>
          </div>
        )}
        {node.vendor && (
          <div className="text-muted-foreground">
            厂商：<span className="text-foreground">{node.vendor}</span>
          </div>
        )}
        <div className="text-muted-foreground">
          型号：<span className="text-foreground">{node.model || '—'}</span>
        </div>
        <div className="text-muted-foreground">
          软件版本：<span className="text-foreground">{node.firmwareVersion || '—'}</span>
        </div>
        <div className="text-muted-foreground">
          LLDP：
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              lldpMeta.badgeClassName
            )}
          >
            {lldpMeta.label}
          </span>
        </div>
        {node.unmanagedNeighbors > 0 && (
          <div className="text-muted-foreground">未纳管邻居 {node.unmanagedNeighbors} 个</div>
        )}
      </dl>

      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground">LLDP 链路（{links.length}）</div>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">该设备尚未发现与台账设备的 LLDP 链路</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {links.map((link) => {
              const outbound = link.source === node.id
              const peer = nodeById.get(outbound ? link.target : link.source)
              const localPort = outbound ? link.sourcePort : link.targetPort
              const peerPort = outbound ? link.targetPort : link.sourcePort
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-1 text-foreground">
                  <span className="font-mono">{localPort || '未知端口'}</span>{' '}
                  <span className="text-muted-foreground">↔</span>{' '}
                  <span className="font-medium">{peer?.name ?? '未知设备'}</span>{' '}
                  <span className="font-mono">{peerPort || '未知端口'}</span>
                  {!link.bidirectional && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      仅单侧可见
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
