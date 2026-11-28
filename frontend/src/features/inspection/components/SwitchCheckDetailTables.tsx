/**
 * 交换机专项检查项明细表（堆叠状态、接口状态一致性/双工、Flash 存储使用率）
 *
 * 从 CheckDetailTables 拆出以控制单文件体量；与主组件共用一致的折叠外壳、
 * 判定色阶与缺失占位符规范。
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  CheckDetailVerdict,
  FlashUsageDetails,
  InterfaceStatusDetails,
  InterfaceUtilizationSkipped,
  StackStatusDetails,
} from '../types'
import { cn } from '@/utils/cn'

const EMPTY = '-'

const VERDICT_LABELS: Record<CheckDetailVerdict, string> = {
  pass: '正常',
  warning: '警告',
  fail: '异常',
  skip: '未判定',
}

const VERDICT_TONES: Record<CheckDetailVerdict, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  fail: 'text-red-600 dark:text-red-400',
  skip: 'text-muted-foreground',
}

const VerdictCell = ({ verdict }: { verdict: CheckDetailVerdict }) => (
  <td className={cn('py-1.5 pr-3 whitespace-nowrap font-medium', VERDICT_TONES[verdict])}>
    {VERDICT_LABELS[verdict]}
  </td>
)

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[unit]}`
}

const SwitchDisclosure = ({ summary, children }: { summary: string; children: ReactNode }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {summary}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-border bg-background/60 p-3">{children}</div>
      )}
    </div>
  )
}

const SwitchTable = ({ headers, children }: { headers: string[]; children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground border-b border-border">
          {headers.map((header, index) => (
            <th
              key={header}
              className={cn('text-left font-normal py-1', index < headers.length - 1 && 'pr-3')}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
)

const SwitchSkippedList = ({ items }: { items: InterfaceUtilizationSkipped[] }) => {
  if (items.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-1.5">未参与判定的分区（{items.length} 个）</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.name}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title={item.reason}
          >
            <span className="font-medium text-foreground/70">{item.name}</span>
            <span className="opacity-70">{item.reason}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const StackStatusTable = ({ details }: { details: StackStatusDetails }) => {
  const modeLabel = !details.enabled ? '未启用' : details.standalone ? '单机模式' : `${details.member_count} 台成员`
  const summary = `堆叠状态明细（${modeLabel}，拓扑：${details.topology || EMPTY}，堆叠口 Up ${details.port_up_count} / Down ${details.port_down_count}）`

  return (
    <SwitchDisclosure summary={summary}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground text-[11px]">运行模式</div>
          <div className="font-semibold text-foreground mt-0.5">{modeLabel}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground text-[11px]">堆叠拓扑</div>
          <div className="font-semibold text-foreground mt-0.5">{details.topology || EMPTY}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground text-[11px]">成员数量</div>
          <div className="font-semibold text-foreground mt-0.5 tabular-nums">{details.member_count}</div>
        </div>
        <div className="rounded bg-muted/50 p-2">
          <div className="text-muted-foreground text-[11px]">堆叠端口 (Up / Down)</div>
          <div className="font-semibold text-foreground mt-0.5 tabular-nums">
            {details.port_up_count} / {details.port_down_count}
          </div>
        </div>
      </div>

      {details.members.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground mb-1">堆叠成员</p>
          <SwitchTable headers={['成员 ID', '角色', '优先级', 'MAC 地址', '判定']}>
            {details.members.map((member) => (
              <tr key={member.id} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 font-medium text-foreground/90 whitespace-nowrap">{member.id}</td>
                <td className="py-1.5 pr-3 text-foreground/90 whitespace-nowrap">{member.role || EMPTY}</td>
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                  {member.priority ?? EMPTY}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap font-mono">
                  {member.mac || EMPTY}
                </td>
                <VerdictCell verdict={member.verdict} />
              </tr>
            ))}
          </SwitchTable>
        </div>
      )}

      {details.ports.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">堆叠端口</p>
          <SwitchTable headers={['堆叠端口', '链路状态', '判定']}>
            {details.ports.map((port) => (
              <tr key={port.name} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{port.name}</td>
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{port.status || EMPTY}</td>
                <VerdictCell verdict={port.verdict} />
              </tr>
            ))}
          </SwitchTable>
        </div>
      )}

      {details.members.length === 0 && details.ports.length === 0 && (
        <p className="text-xs text-muted-foreground">本次未采集到堆叠成员或端口明细。</p>
      )}
    </SwitchDisclosure>
  )
}

const InterfaceStatusDetailTable = ({ details }: { details: InterfaceStatusDetails }) => {
  const isDuplex = details.sub_kind === 'duplex'
  const summaryParts = [
    `已评估 ${details.total_evaluated} 个`,
    `${isDuplex ? '半双工异常' : '异常'} ${details.abnormal_count} 个`,
  ]
  if (details.admin_down_count !== undefined) summaryParts.push(`管理关闭 ${details.admin_down_count} 个`)
  if (details.idle_count !== undefined) summaryParts.push(`空闲 ${details.idle_count} 个`)

  const summary = `${isDuplex ? '接口双工模式明细' : '接口状态一致性明细'}（${summaryParts.join('，')}）`
  const headers = isDuplex
    ? ['接口', '速率', '状态', '双工模式', '判定', '原因']
    : ['接口', '速率', '状态', '判定', '原因']

  return (
    <SwitchDisclosure summary={summary}>
      {details.entries.length > 0 ? (
        <SwitchTable headers={headers}>
          {details.entries.map((entry) => (
            <tr key={`${entry.name}-${entry.status_label}`} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">
                <div>{entry.name}</div>
                {entry.alias && <div className="text-[11px] font-normal text-muted-foreground">{entry.alias}</div>}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {entry.speed_mbps !== undefined ? `${entry.speed_mbps} Mbps` : EMPTY}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{entry.status_label || EMPTY}</td>
              {isDuplex && (
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                  {entry.duplex_label || EMPTY}
                </td>
              )}
              <VerdictCell verdict={entry.verdict} />
              <td className="py-1.5 text-muted-foreground break-all">{entry.reason || EMPTY}</td>
            </tr>
          ))}
        </SwitchTable>
      ) : (
        <p className="text-xs text-muted-foreground">所有已评估接口均正常，无异常明细。</p>
      )}
    </SwitchDisclosure>
  )
}

const FlashUsageTable = ({ details }: { details: FlashUsageDetails }) => {
  if (details.partitions.length === 0 && details.skipped.length === 0) return null

  return (
    <SwitchDisclosure
      summary={`Flash 存储明细（已评估 ${details.evaluated}/${details.total} 个分区${
        details.over_warning > 0 ? `，${details.over_warning} 个超阈值` : ''
      }）`}
    >
      {details.partitions.length > 0 ? (
        <SwitchTable headers={['分区', '判定', '使用率', '已用', '剩余', '容量']}>
          {details.partitions.map((part) => (
            <tr key={part.name} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{part.name}</td>
              <VerdictCell verdict={part.verdict} />
              <td className={cn('py-1.5 pr-3 whitespace-nowrap font-medium tabular-nums', VERDICT_TONES[part.verdict])}>
                {part.percent.toFixed(1)}%
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatBytes(part.used_bytes)}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatBytes(part.free_bytes)}
              </td>
              <td className="py-1.5 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatBytes(part.total_bytes)}
              </td>
            </tr>
          ))}
        </SwitchTable>
      ) : (
        <p className="text-xs text-muted-foreground">本次没有可评估的 Flash 存储分区。</p>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        判定口径：已用 / 容量，警告线 {details.warning_threshold}%，故障线 {details.critical_threshold}%
      </p>

      <SwitchSkippedList items={details.skipped} />
    </SwitchDisclosure>
  )
}

export function SwitchCheckDetailTables({
  details,
}: {
  details: StackStatusDetails | InterfaceStatusDetails | FlashUsageDetails
}) {
  switch (details.kind) {
    case 'stack_status':
      return <StackStatusTable details={details} />
    case 'interface_status_detail':
      return <InterfaceStatusDetailTable details={details} />
    case 'flash_usage':
      return <FlashUsageTable details={details} />
  }
}
