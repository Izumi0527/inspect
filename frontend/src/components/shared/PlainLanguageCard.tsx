/**
 * 人话解读卡片
 *
 * 把翻译结果渲染成「标题 + 说明 + 建议」的统一结构，
 * 供日志中心与告警中心的详情弹窗共用，避免两处重复实现。
 */
import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Lightbulb } from 'lucide-react'
import type { PlainLanguageResult, PlainTone } from '@/lib/plain-language'

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
  className?: string
}

export const PlainLanguageCard: React.FC<PlainLanguageCardProps> = ({ result, className = '' }) => {
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
    </div>
  )
}
