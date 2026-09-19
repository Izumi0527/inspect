import React, { useMemo, useState } from 'react'
import { Link2Off } from 'lucide-react'

import { cn } from '@/utils/cn'
import type { NetworkTopology, TopologyLink, TopologyNode } from '../../types'
import { layoutTopology, NODE_H, NODE_W, type LayoutNode } from '../../utils/topologyLayout'
import {
  getDeviceTypeLabel,
  getDeviceVisualMetaByType,
  getTopologyLLDPStatusMeta,
  getTopologyNodeStatusMeta,
  HUAWEI_LLDP_ENABLE_COMMAND,
  HUAWEI_LLDP_VIEW_COMMANDS,
  iconMap,
} from './deviceVisualMeta'

interface NetworkTopologyGraphProps {
  topology: NetworkTopology
}

const ICON_SIZE = 32

// 节点展示类型：SNMP 识别优先，缺失退回台账
const displayTypeOf = (node: TopologyNode) => node.detectedType ?? node.deviceType

// 名称过长会盖到相邻节点，按节点宽度截断
const truncateLabel = (label: string, max = 12) =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label

const namesOf = (nodes: TopologyNode[]) => nodes.map((node) => node.name).join('、')

// 没有链路时把采集端的判定翻译成运维动作：视图未放行与设备未启用是两套不同的命令；
// 采集正常却全是未纳管邻居，则问题出在台账身份对不上，而不是设备配置
const EmptyLinksHint: React.FC<{ nodes: TopologyNode[] }> = ({ nodes }) => {
  const unreachable = nodes.filter((node) => node.lldpStatus === 'mib_unreachable')
  const disabled = nodes.filter((node) => node.lldpStatus === 'disabled')
  const unmatched = nodes.filter((node) => node.lldpStatus === 'ok' && node.unmanagedNeighbors > 0)
  const diagnosed = unreachable.length > 0 || disabled.length > 0 || unmatched.length > 0

  return (
    <div
      data-testid="topology-empty-hint"
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
    >
      <p className="flex items-center gap-2">
        <Link2Off className="h-4 w-4 shrink-0" />
        {diagnosed
          ? '尚未发现 LLDP 链路，采集已定位到以下原因；采集每 3 分钟自动刷新。'
          : '尚未发现 LLDP 链路：请确认设备已全局启用 LLDP，且 SNMP 视图放行 1.0.8802.1.1.2；采集每 3 分钟自动刷新。'}
      </p>
      {unreachable.length > 0 && (
        <div className="pl-6">
          <p>
            {unreachable.length} 台设备的 SNMP 视图未放行 LLDP-MIB（1.0.8802.1.1.2）：
            <span className="text-foreground">{namesOf(unreachable)}</span>
          </p>
          <p>华为设备缺省视图只含 1.3.6.1，请在设备上执行：</p>
          <ul className="mt-1 space-y-0.5 font-mono text-foreground">
            {HUAWEI_LLDP_VIEW_COMMANDS.map((command) => (
              <li key={command}>{command}</li>
            ))}
          </ul>
        </div>
      )}
      {disabled.length > 0 && (
        <div className="pl-6">
          <p>
            {disabled.length} 台设备未全局启用 LLDP：
            <span className="text-foreground">{namesOf(disabled)}</span>
          </p>
          <p>
            请在设备系统视图执行 <span className="font-mono text-foreground">{HUAWEI_LLDP_ENABLE_COMMAND}</span>
          </p>
        </div>
      )}
      {unmatched.length > 0 && (
        <div className="pl-6">
          <p>
            {unmatched.length} 台设备读到了 LLDP 邻居但都没匹配到台账设备：
            <span className="text-foreground">{namesOf(unmatched)}</span>
          </p>
          <p>请核对对端是否已纳管、台账管理 IP 是否与设备的 LLDP 管理地址一致；采集会自动回填 sysName 与机箱 MAC 参与匹配。</p>
        </div>
      )}
    </div>
  )
}

export const NetworkTopologyGraph: React.FC<NetworkTopologyGraphProps> = ({ topology }) => {
  const layout = useMemo(() => layoutTopology(topology), [topology])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const nodeById = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    [topology.nodes]
  )
  const positionById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  )

  const selectedNode = selectedId !== null ? nodeById.get(selectedId) ?? null : null
  const selectedLinks = selectedNode
    ? topology.links.filter((link) => link.source === selectedNode.id || link.target === selectedNode.id)
    : []

  if (topology.nodes.length === 0) {
    return null
  }

  const centerOf = (position: LayoutNode) => ({
    x: position.x + NODE_W / 2,
    y: position.y + NODE_H / 2,
  })

  const isLinkUp = (link: TopologyLink) =>
    nodeById.get(link.source)?.status === 'online' && nodeById.get(link.target)?.status === 'online'

  const toggleSelect = (id: number) => setSelectedId((current) => (current === id ? null : id))

  return (
    <div className="flex flex-col gap-4">
      {topology.links.length === 0 && <EmptyLinksHint nodes={topology.nodes} />}

      <div className="flex w-full justify-center overflow-x-auto py-2">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          className="h-auto max-w-full"
          style={{ maxHeight: 520 }}
          role="img"
          aria-label="网络拓扑图"
        >
          {topology.links.map((link) => {
            const from = positionById.get(link.source)
            const to = positionById.get(link.target)
            if (!from || !to) return null
            const a = centerOf(from)
            const b = centerOf(to)
            const up = isLinkUp(link)
            return (
              <g key={link.id}>
                <line
                  data-testid="topology-link"
                  data-bidirectional={link.bidirectional ? 'true' : 'false'}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={link.bidirectional ? 2.5 : 1.5}
                  strokeDasharray={link.bidirectional ? undefined : '6 4'}
                  strokeLinecap="round"
                  className={cn(
                    'transition-colors duration-300',
                    up ? 'stroke-emerald-500/70' : 'stroke-muted-foreground/40',
                    selectedNode && (link.source === selectedNode.id || link.target === selectedNode.id) && 'stroke-blue-500'
                  )}
                />
              </g>
            )
          })}

          {topology.nodes.map((node) => {
            const position = positionById.get(node.id)
            if (!position) return null
            const meta = getDeviceVisualMetaByType(displayTypeOf(node))
            const statusMeta = getTopologyNodeStatusMeta(node.status)
            const Icon = iconMap[meta.icon]
            const selected = node.id === selectedId
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`设备节点 ${node.name}`}
                aria-pressed={selected}
                transform={`translate(${position.x}, ${position.y})`}
                className="group cursor-pointer outline-none"
                onClick={() => toggleSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleSelect(node.id)
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
                  {getDeviceTypeLabel(displayTypeOf(node))}
                </text>
                <title>{`${node.name} (${node.ip}) · ${getDeviceTypeLabel(displayTypeOf(node))} · ${statusMeta.label}`}</title>
              </g>
            )
          })}
        </svg>
      </div>

      {selectedNode && (
        <div
          data-testid="topology-node-detail"
          className="rounded-xl border border-border bg-card p-4 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">{selectedNode.name}</span>
            <span className="text-muted-foreground">{selectedNode.ip}</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                getTopologyNodeStatusMeta(selectedNode.status).badgeClassName
              )}
            >
              {getTopologyNodeStatusMeta(selectedNode.status).label}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {selectedNode.detectedType ? (
              <>
                <div className="text-muted-foreground">
                  SNMP 识别：<span className="text-foreground">{getDeviceTypeLabel(selectedNode.detectedType)}</span>
                </div>
                <div className="text-muted-foreground">
                  档案类型：<span className="text-foreground">{getDeviceTypeLabel(selectedNode.deviceType)}</span>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">
                档案类型：<span className="text-foreground">{getDeviceTypeLabel(selectedNode.deviceType)}</span>
                <span className="ml-1">（SNMP 未识别）</span>
              </div>
            )}
            {selectedNode.vendor && (
              <div className="text-muted-foreground">
                厂商：<span className="text-foreground">{selectedNode.vendor}</span>
              </div>
            )}
            <div className="text-muted-foreground">
              型号：<span className="text-foreground">{selectedNode.model || '—'}</span>
            </div>
            <div className="text-muted-foreground">
              软件版本：<span className="text-foreground">{selectedNode.firmwareVersion || '—'}</span>
            </div>
            <div className="text-muted-foreground">
              LLDP：
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                  getTopologyLLDPStatusMeta(selectedNode.lldpStatus).badgeClassName
                )}
              >
                {getTopologyLLDPStatusMeta(selectedNode.lldpStatus).label}
              </span>
            </div>
            {selectedNode.unmanagedNeighbors > 0 && (
              <div className="text-muted-foreground">未纳管邻居 {selectedNode.unmanagedNeighbors} 个</div>
            )}
          </dl>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              LLDP 链路（{selectedLinks.length}）
            </div>
            {selectedLinks.length === 0 ? (
              <p className="text-xs text-muted-foreground">该设备尚未发现与台账设备的 LLDP 链路</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {selectedLinks.map((link) => {
                  const outbound = link.source === selectedNode.id
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
      )}
    </div>
  )
}
