/**
 * 人话解读卡片
 *
 * 把翻译结果渲染成「标题 + 说明 + 建议」的统一结构，
 * 供日志中心与告警中心的详情弹窗共用，避免两处重复实现。
 */
import React from 'react'
import { AlertCircle, AlertTriangle, BookOpen, CheckCircle2, Info, Lightbulb } from 'lucide-react'
import type {
  HuaweiAlarmKnowledge,
  HuaweiKnowledgeLookupResponse,
  HuaweiKnowledgeParam,
  HuaweiLogKnowledge,
  HuaweiMIBKnowledge,
  PlainLanguageResult,
  PlainTone,
} from '@/lib/plain-language'
import { RawInfoDisclosure } from './RawInfoDisclosure'

/**
 * 语气 → 图标与配色。
 *
 * 独立导出供列表项复用：列表项布局更紧凑，不适合直接套用整张卡片，
 * 但配色需与详情弹窗保持一致。
 */
export const PLAIN_TONE_STYLES: Record<
  PlainTone,
  { Icon: typeof Info; text: string; bg: string; border: string }
> = {
  critical: {
    Icon: AlertCircle,
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-900',
  },
  warning: {
    Icon: AlertTriangle,
    text: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-900',
  },
  info: {
    Icon: Info,
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-900',
  },
  success: {
    Icon: CheckCircle2,
    text: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-900',
  },
}

export interface PlainLanguageCardProps {
  result: PlainLanguageResult
  knowledge?: HuaweiKnowledgeLookupResponse | null
  className?: string
}

function KnowledgeStringList({
  title,
  items,
  ordered = false,
}: {
  title: string
  items?: string[]
  ordered?: boolean
}) {
  if (!items || items.length === 0) return null
  const ListTag = ordered ? 'ol' : 'ul'
  const listStyle = ordered ? 'list-decimal' : 'list-disc'

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ListTag className={`${listStyle} pl-4 space-y-1 text-xs text-foreground/85 leading-relaxed`}>
        {items.map((entry, idx) => (
          <li key={idx}>{entry}</li>
        ))}
      </ListTag>
    </div>
  )
}

function KnowledgeParamsList({ parameters }: { parameters?: HuaweiKnowledgeParam[] }) {
  if (!parameters || parameters.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">参数说明</p>
      <ul className="space-y-1 text-xs text-foreground/85">
        {parameters.map((param, idx) => (
          <li key={`${param.name}-${idx}`} className="flex flex-wrap gap-1.5">
            <span className="font-mono font-medium text-foreground">{param.name}:</span>
            <span>{param.meaning}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AlarmKnowledgeDetails({ alarm }: { alarm: HuaweiAlarmKnowledge }) {
  const metaParts = [alarm.alarm_name, alarm.module, alarm.oid, alarm.severity].filter(Boolean)
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground break-all">
        {metaParts.join(' · ')}
      </p>
      {alarm.meaning && (
        <p className="text-xs text-foreground/90 leading-relaxed">{alarm.meaning}</p>
      )}
      {alarm.impact && (
        <p className="text-xs text-foreground/85 leading-relaxed">
          <span className="font-medium text-muted-foreground">对系统影响：</span>
          {alarm.impact}
        </p>
      )}
      <KnowledgeParamsList parameters={alarm.parameters} />
      <KnowledgeStringList title="可能原因" items={alarm.causes} />
      <KnowledgeStringList title="处理建议" items={alarm.procedures} ordered />
    </div>
  )
}

function LogKnowledgeDetails({ log }: { log: HuaweiLogKnowledge }) {
  const header = `${log.module}/${log.severity}/${log.mnemonic}`
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground break-all">{header}</p>
      {log.meaning && (
        <p className="text-xs text-foreground/90 leading-relaxed">{log.meaning}</p>
      )}
      <KnowledgeParamsList parameters={log.parameters} />
      <KnowledgeStringList title="可能原因" items={log.causes} />
      <KnowledgeStringList title="处理建议" items={log.procedures} ordered />
    </div>
  )
}

function MIBKnowledgeDetails({ mib }: { mib: HuaweiMIBKnowledge }) {
  const metaParts = [mib.mib, mib.name, mib.oid, mib.data_type].filter(Boolean)
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground break-all">
        {metaParts.join(' · ')}
      </p>
      {mib.meaning && (
        <p className="text-xs text-foreground/90 leading-relaxed">{mib.meaning}</p>
      )}
      {mib.impl_spec && (
        <p className="text-xs text-foreground/85 leading-relaxed">
          <span className="font-medium text-muted-foreground">实现规格：</span>
          {mib.impl_spec}
        </p>
      )}
    </div>
  )
}

function HuaweiKnowledgeSection({ knowledge }: { knowledge: HuaweiKnowledgeLookupResponse }) {
  if (!knowledge.matched) return null

  let content: React.ReactNode = null
  if (knowledge.kind === 'alarm' && knowledge.alarm) {
    content = <AlarmKnowledgeDetails alarm={knowledge.alarm} />
  } else if (knowledge.kind === 'log' && knowledge.log) {
    content = <LogKnowledgeDetails log={knowledge.log} />
  } else if (knowledge.kind === 'mib' && knowledge.mib) {
    content = <MIBKnowledgeDetails mib={knowledge.mib} />
  }

  if (!content) return null

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>华为官方文档参考</span>
      </div>
      {content}
    </div>
  )
}

export const PlainLanguageCard: React.FC<PlainLanguageCardProps> = ({
  result,
  knowledge,
  className = '',
}) => {
  const tone = PLAIN_TONE_STYLES[result.tone] ?? PLAIN_TONE_STYLES.info
  const { Icon } = tone

  return (
    <div className={`p-4 rounded-lg border ${tone.bg} ${tone.border} ${className}`}>
      <h3 className={`text-sm font-semibold flex items-center gap-2 ${tone.text}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        {result.title}
      </h3>

      <p className="mt-2 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
        {result.summary}
      </p>

      {result.suggestion && (
        <div className="mt-3 flex items-start gap-2 text-sm text-foreground/80">
          <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <p className="leading-relaxed">
            <span className="font-medium">建议：</span>
            {result.suggestion}
          </p>
        </div>
      )}

      {/*
        告警标识：厂商对这条告警的精确定义，供需要核对的人展开查看。
        默认折叠 —— 对多数使用者，上面的人话已经够用。
      */}
      {result.trap && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <RawInfoDisclosure label="告警标识">
            <div className="space-y-1.5">
              <p className="font-mono text-xs text-muted-foreground break-all">
                {result.trap.name} · {result.trap.oid}
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                <span className="text-muted-foreground">厂商说明：</span>
                {result.trap.detail ?? result.trap.label}
              </p>
            </div>
          </RawInfoDisclosure>
        </div>
      )}

      {knowledge && <HuaweiKnowledgeSection knowledge={knowledge} />}
    </div>
  )
}
