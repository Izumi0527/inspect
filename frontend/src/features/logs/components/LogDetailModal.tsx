/**
 * 日志详情弹窗
 */
import React from 'react'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import {
  Server,
  Clock,
  Terminal,
  FileText,
  Copy,
  CheckCircle
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'react-hot-toast'
import type { DeviceLog } from '../types'
import { LOG_LEVEL_CONFIG, LOG_FACILITY_CONFIG, LOG_SOURCE_CONFIG } from '../types'

interface LogDetailModalProps {
  open: boolean
  log: DeviceLog | null
  onClose: () => void
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({
  open,
  log,
  onClose
}) => {
  if (!log) return null

  const levelConfig = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info
  const facilityConfig = LOG_FACILITY_CONFIG[log.facility] || LOG_FACILITY_CONFIG.other
  const sourceConfig = LOG_SOURCE_CONFIG[log.source] || { label: log.source }

  const formatTime = (dateStr: string) => {
    const formatted = formatDateTimeYMDHMS(dateStr)
    return formatted === '无效日期' ? dateStr : formatted
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label}已复制到剪贴板`)
    }).catch(() => {
      toast.error('复制失败')
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="h-5 w-5" />
            日志详情
            <Badge className={`${levelConfig.bgColor} ${levelConfig.color} border-0 ml-2`}>
              {levelConfig.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">设备</label>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-gray-400" />
                <span className="font-medium">
                  {log.device_name || `设备 ${log.device_id}`}
                </span>
                {log.device_ip && (
                  <span className="text-gray-500">({log.device_ip})</span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">设施类型</label>
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-gray-400" />
                <span>{facilityConfig.label}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">日志来源</label>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-gray-400" />
                <span>{sourceConfig.label}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">日志时间</label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>{formatTime(log.log_timestamp)}</span>
              </div>
            </div>

            {log.source_ip && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">来源IP</label>
                <span>{log.source_ip}</span>
              </div>
            )}

            {log.source_process && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">来源进程</label>
                <span>{log.source_process}</span>
              </div>
            )}
          </div>

          {/* 日志消息 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">
                日志消息
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(log.message, '日志消息')}
              >
                <Copy className="h-4 w-4 mr-1" />
                复制
              </Button>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 font-mono text-sm break-all whitespace-pre-wrap">
              {log.message}
            </div>
          </div>

          {/* 原始消息 */}
          {log.raw_message && log.raw_message !== log.message && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  原始消息
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(log.raw_message!, '原始消息')}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  复制
                </Button>
              </div>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                {log.raw_message}
              </div>
            </div>
          )}

          {/* 时间信息 */}
          <div className="border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div>
                <span className="text-gray-400">采集时间：</span>
                {formatTime(log.collected_at)}
              </div>
              <div>
                <span className="text-gray-400">创建时间：</span>
                {formatTime(log.created_at)}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
