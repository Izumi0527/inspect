import React from 'react'
import { Link2Off } from 'lucide-react'

import type { TopologyNode } from '../../types'
import { HUAWEI_LLDP_ENABLE_COMMAND, HUAWEI_LLDP_VIEW_COMMANDS } from './deviceVisualMeta'

const namesOf = (nodes: TopologyNode[]) => nodes.map((node) => node.name).join('、')

// 没有链路时把采集端的判定翻译成运维动作：视图未放行与设备未启用是两套不同的命令；
// 采集正常却全是未纳管邻居，则问题出在台账身份对不上，而不是设备配置
export const EmptyLinksHint: React.FC<{ nodes: TopologyNode[] }> = ({ nodes }) => {
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
