/**
 * 日志列表项组件
 */
import React from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
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
import type { DeviceLog } from '../types'
import { LOG_LEVEL_CONFIG, LOG_FACILITY_CONFIG } from '../types'

interface LogListItemProps {
  log: DeviceLog
  isSelected: boolean
  onSelect: (logId: number) => void
  onDelete: (logId: number) => void
  onClick?: (log: DeviceLog) => void
}

export const LogListItem: React.FC<LogListItemProps> = ({
  log,
  isSelected,
  onSelect,
  onDelete,
  onClick
}) => {
  const levelConfig = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info
  const facilityConfig = LOG_FACILITY_CONFIG[log.facility] || LOG_FACILITY_CONFIG.other

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MM-dd HH:mm:ss', { locale: zhCN })
    } catch {
      return dateStr
    }
  }

  return (
    <div
      className={`
        group flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-800
        hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
      `}
      onClick={() => onClick?.(log)}
    >
      {/* 选择框 */}
      <div className="pt-1" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(log.id)}
        />
      </div>

      {/* 日志级别标签 */}
      <div className="flex-shrink-0 pt-0.5">
        <Badge className={`${levelConfig.bgColor} ${levelConfig.color} border-0`}>
          {levelConfig.label}
        </Badge>
      </div>

      {/* 日志内容 */}
      <div className="flex-1 min-w-0">
        {/* 日志消息 */}
        <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all line-clamp-2">
          {log.message}
        </p>

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
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(log.id)
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  )
}
