/**
 * 日志列表项组件
 *
 * 默认展示人话解读，设备原文收起；用户可就地展开原文而无需打开详情弹窗。
 */
import React, { useMemo, useState } from 'react'
import { formatDateTimeMDHMS } from '@/utils/formatters'
import {
  Server,
  Clock,
  Terminal,
  ChevronRight,
  Trash2
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PLAIN_TONE_STYLES } from '@/components/shared'
import { translateToPlainLanguage } from '@/lib/plain-language'
import type { DeviceLog } from '../types'
import { LOG_LEVEL_CONFIG, LOG_FACILITY_CONFIG } from '../types'

interface LogListItemProps {
  log: DeviceLog
  isSelected?: boolean
  enableSelection?: boolean
  onSelect?: (logId: number) => void
  onDelete?: (logId: number) => void
  onClick?: (log: DeviceLog) => void
}

export const LogListItem: React.FC<LogListItemProps> = ({
  log,
  isSelected = false,
  enableSelection = true,
  onSelect,
  onDelete,
  onClick
}) => {
  const levelConfig = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info
  const facilityConfig = LOG_FACILITY_CONFIG[log.facility] || LOG_FACILITY_CONFIG.other

  const plain = useMemo(
    () => translateToPlainLanguage({
      message: log.message,
      level: log.level,
      facility: log.facility,
      deviceName: log.device_name,
    }),
    [log.message, log.level, log.facility, log.device_name],
  )

  // null 表示用户尚未手动切换，此时跟随翻译结果：
  // 未命中规则时兜底文案信息量很低，直接把原文亮出来才有意义。
  const [rawOverride, setRawOverride] = useState<boolean | null>(null)
  const showRaw = rawOverride ?? !plain.matched

  const toneStyle = PLAIN_TONE_STYLES[plain.tone] ?? PLAIN_TONE_STYLES.info
  const ToneIcon = toneStyle.Icon

  const formatTime = (dateStr: string) => {
    const formatted = formatDateTimeMDHMS(dateStr)
    return formatted === '无效日期' ? dateStr : formatted
  }

  return (
    <div
      className={`
        group flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-800
        hover:bg-muted/40 transition-colors cursor-pointer
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
      `}
      onClick={() => onClick?.(log)}
    >
      {/* 选择框 */}
      {enableSelection && onSelect && (
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(log.id)}
          />
        </div>
      )}

      {/* 日志级别标签：保持设备上报的原始级别，与筛选器口径一致 */}
      <div className="flex-shrink-0 pt-0.5">
        <Badge className={`${levelConfig.bgColor} ${levelConfig.color} border-0`}>
          {levelConfig.label}
        </Badge>
      </div>

      {/* 日志内容 */}
      <div className="flex-1 min-w-0">
        {/* 人话解读 */}
        <p className={`text-sm font-medium flex items-center gap-1.5 ${toneStyle.text}`}>
          <ToneIcon className="h-3.5 w-3.5 flex-shrink-0" />
          {plain.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {plain.summary}
        </p>

        {/* 设备原文：默认收起 */}
        {showRaw && (
          <p className="mt-2 p-2 rounded bg-muted/60 text-xs text-muted-foreground font-mono break-all whitespace-pre-wrap">
            {log.message}
          </p>
        )}

        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
          {/* 设备信息 */}
          <span className="flex items-center gap-1">
            <Server className="h-3 w-3" />
            {log.device_name || `设备 ${log.device_id}`}
            {log.device_ip && <span className="text-gray-400">({log.device_ip})</span>}
          </span>

          {/* 设施类型 */}
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" />
            {facilityConfig.label}
          </span>

          {/* 时间 */}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(log.log_timestamp)}
          </span>

          {/* 来源进程 */}
          {log.source_process && (
            <span className="text-gray-400">
              [{log.source_process}]
            </span>
          )}

          {/* 原文就地切换：不打开详情弹窗 */}
          <button
            type="button"
            aria-expanded={showRaw}
            aria-label={showRaw ? `收起日志 ${log.id} 的原始信息` : `展开日志 ${log.id} 的原始信息`}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setRawOverride(!showRaw)
            }}
          >
            {showRaw ? '收起原文' : '原文'}
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-red-600"
            aria-label={`删除日志 ${log.id}`}
            title={`删除日志 ${log.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(log.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  )
}
