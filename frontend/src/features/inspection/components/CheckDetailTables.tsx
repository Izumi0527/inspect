/**
 * 检查项明细表（错包/丢弃、光模块、BGP 邻居、部件状态）
 *
 * 巡检执行器把逐项结果写进 inspection_results.details，顶层 kind 区分载荷类型。
 * 本组件按 kind 分派渲染，接口利用率因带进度条自定义渲染，仍由
 * InterfaceUtilizationTable 负责，这里不重复出表。
 *
 * 默认折叠：一台设备可能有数十个接口、十几个光模块，展开后才占据版面。
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  BGPPeersDetails,
  CheckDetailVerdict,
  CheckResultDetails,
  ComponentStatusDetails,
  InterfaceRatioDetails,
  InterfaceUtilizationSkipped,
  OpticalPowerDetails,
} from '../types'
import { cn } from '@/utils/cn'

/** 判定词的中文标签，与检查结果状态共用一套词表 */
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

/**
 * 缺失数据的统一占位符。
 * 必须与 0 可区分：「未上报电压」和「电压 0V」是两个完全不同的结论。
 */
const EMPTY = '-'

const formatOptional = (value: number | undefined, unit: string | undefined, digits: number): string => {
  if (value === undefined) return EMPTY
  return `${value.toFixed(digits)}${unit ?? ''}`
}

const formatPercent = (percent: number): string => {
  if (percent > 0 && percent < 0.01) return '<0.01%'
  return `${percent.toFixed(2)}%`
}

/** 把秒数说成人话；0 或缺失返回占位符 */
const formatSeconds = (seconds: number | undefined): string => {
  if (seconds === undefined || seconds <= 0) return EMPTY
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  // 逐级省略为零的低位：3600 秒说成「1 小时」而不是「1 小时 0 分钟」
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  if (minutes > 0) return `${minutes} 分钟`
  return `${seconds} 秒`
}

/** 折叠外壳：标题行常驻，内容按需展开 */
const Disclosure = ({ summary, children }: { summary: string; children: ReactNode }) => {
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

/** 明细表的统一表壳，负责横向滚动与表头样式 */
const DetailTable = ({ headers, children }: { headers: string[]; children: ReactNode }) => (
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

/** 未参与评估的对象清单，错包与光模块共用 */
const SkippedList = ({ label, items }: { label: string; items: InterfaceUtilizationSkipped[] }) => {
  if (items.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-1.5">
        {label}（{items.length} 个）
      </p>
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

/** 判定口径说明，放在表尾 */
const CriteriaNote = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-[11px] text-muted-foreground">{children}</p>
)

const InterfaceRatioTable = ({ details }: { details: InterfaceRatioDetails }) => {
  const label = details.kind === 'interface_errors' ? '错包' : '丢弃'
  if (details.interfaces.length === 0 && details.skipped.length === 0) return null

  return (
    <Disclosure
      summary={`接口${label}率明细（已评估 ${details.evaluated}/${details.total} 个接口${
        details.over_warning > 0 ? `，${details.over_warning} 个超阈值` : ''
      }）`}
    >
      {details.interfaces.length > 0 ? (
        <DetailTable headers={['接口', '峰值方向', `${label}率`, `${label}数`, '包数']}>
          {details.interfaces.map((entry) => (
            <tr key={`${entry.name}-${entry.direction}`} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{entry.name}</td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{entry.direction}</td>
              <td
                className={cn(
                  'py-1.5 pr-3 whitespace-nowrap font-medium tabular-nums',
                  entry.percent >= details.critical_threshold
                    ? VERDICT_TONES.fail
                    : entry.percent >= details.warning_threshold
                      ? VERDICT_TONES.warning
                      : VERDICT_TONES.pass
                )}
              >
                {formatPercent(entry.percent)}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {entry.count}
              </td>
              <td className="py-1.5 text-muted-foreground whitespace-nowrap tabular-nums">
                {entry.packets}
              </td>
            </tr>
          ))}
        </DetailTable>
      ) : (
        <p className="text-xs text-muted-foreground">本次没有可计算{label}率的接口。</p>
      )}

      <CriteriaNote>
        判定口径：累计比率 = {label}数 / ({label}数 + 包数)，警告线{' '}
        {formatPercent(details.warning_threshold)}，故障线 {formatPercent(details.critical_threshold)}
      </CriteriaNote>

      <SkippedList label="未参与评估的接口" items={details.skipped} />
    </Disclosure>
  )
}

const OpticalPowerTable = ({ details }: { details: OpticalPowerDetails }) => {
  if (details.modules.length === 0 && details.skipped.length === 0) return null

  return (
    <Disclosure
      summary={`光模块明细（已评估 ${details.evaluated}/${details.total} 个模块${
        details.over_warning > 0 ? `，${details.over_warning} 个低于阈值` : ''
      }）`}
    >
      {details.modules.length > 0 ? (
        <DetailTable headers={['模块', '判定', '收光', '发光', '电压', '偏置电流']}>
          {details.modules.map((module) => (
            <tr key={module.index} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{module.index}</td>
              <VerdictCell verdict={module.verdict} />
              <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums font-medium">
                {module.rx_power.toFixed(1)}
                {module.rx_power_unit}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatOptional(module.tx_power, module.tx_power_unit, 1)}
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatOptional(module.voltage, module.voltage_unit, 2)}
              </td>
              <td className="py-1.5 text-muted-foreground whitespace-nowrap tabular-nums">
                {formatOptional(module.bias_current, module.bias_current_unit, 1)}
              </td>
            </tr>
          ))}
        </DetailTable>
      ) : (
        <p className="text-xs text-muted-foreground">本次没有上报收光功率的光模块。</p>
      )}

      <CriteriaNote>
        判定口径：收光功率越低越危险，警告线 {details.warning_threshold}dBm，故障线{' '}
        {details.critical_threshold}dBm。偏置电流升高而发光下降指向激光器老化，否则指向链路衰耗。
      </CriteriaNote>

      <SkippedList label="未参与评估的模块" items={details.skipped} />
    </Disclosure>
  )
}

const BGPPeersTable = ({ details }: { details: BGPPeersDetails }) => {
  if (details.peers.length === 0) return null

  return (
    <Disclosure
      summary={`BGP 邻居明细（共 ${details.total} 个，已建立 ${details.established}，未建立 ${details.down}，近期重建 ${details.flapping}）`}
    >
      <DetailTable headers={['邻居', '判定', '会话状态', '建立时长', '最后错误']}>
        {details.peers.map((peer) => (
          <tr key={peer.index} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{peer.index}</td>
            <VerdictCell verdict={peer.verdict} />
            <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
              {peer.state_label ?? (peer.state !== undefined ? `状态码 ${peer.state}` : EMPTY)}
            </td>
            <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">
              {formatSeconds(peer.established_seconds)}
            </td>
            <td className="py-1.5 text-muted-foreground break-all">{peer.last_error ?? EMPTY}</td>
          </tr>
        ))}
      </DetailTable>

      {details.flapping_threshold_seconds > 0 && (
        <CriteriaNote>
          判定口径：非 Established 判异常；建立时长低于{' '}
          {formatSeconds(details.flapping_threshold_seconds)}视为近期重建，说明会话在反复震荡。
        </CriteriaNote>
      )}
    </Disclosure>
  )
}

const ComponentStatusTable = ({ details }: { details: ComponentStatusDetails }) => {
  if (details.components.length === 0) return null
  const label = details.label || '部件'
  const formatCodes = (codes: number[]) => (codes.length > 0 ? codes.join('、') : '未配置')

  return (
    <Disclosure
      summary={`${label}明细（共 ${details.total} 个，正常 ${details.normal}，异常 ${details.abnormal}，状态码未知 ${details.unknown}）`}
    >
      <DetailTable headers={['编号', '判定', '原始状态码']}>
        {details.components.map((component) => (
          <tr key={component.index} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 pr-3 font-medium text-foreground/90 break-all">{component.index}</td>
            <VerdictCell verdict={component.verdict} />
            <td className="py-1.5 text-muted-foreground whitespace-nowrap tabular-nums">
              {component.state ?? EMPTY}
            </td>
          </tr>
        ))}
      </DetailTable>

      <CriteriaNote>
        判定依据：正常状态码 {formatCodes(details.normal_states)}，异常状态码{' '}
        {formatCodes(details.abnormal_states)}，其余不作判定。状态码语义因厂商而异，
        可在模板 config 的 normal_states / abnormal_states 中按实测取值校准。
      </CriteriaNote>
    </Disclosure>
  )
}

interface CheckDetailTablesProps {
  details: CheckResultDetails
}

/**
 * 按 kind 分派渲染检查项明细。
 * interface_utilization 由 InterfaceUtilizationTable 单独负责，这里返回 null。
 */
export function CheckDetailTables({ details }: CheckDetailTablesProps) {
  switch (details.kind) {
    case 'interface_errors':
    case 'interface_discards':
      return <InterfaceRatioTable details={details} />
    case 'optical_power':
      return <OpticalPowerTable details={details} />
    case 'bgp_peers':
      return <BGPPeersTable details={details} />
    case 'component_status':
      return <ComponentStatusTable details={details} />
    default:
      return null
  }
}
