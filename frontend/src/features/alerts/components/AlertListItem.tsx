import React, { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Shield,
  Clock,
  User,
  CheckCircle,
  X
} from 'lucide-react'
import { Button } from '@/components/atoms'
import { StatusRail, type StatusTone } from '@/components/atoms/status'
import { cn } from '@/utils/cn'
import { humanizeAlertCategory, translateToPlainLanguage } from '@/lib/plain-language'
import { Alert } from '../types'
import { useAlertStyles } from '../hooks/useAlerts'
import { AlertDetailModal } from './AlertDetailModal'
import { formatDateTimeYMDHMS } from '@/utils/formatters'

interface AlertListItemProps {
  alert: Alert
  isSelected: boolean
  onSelect: (id: string) => void
  canUpdate?: boolean
  canDelete?: boolean
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
}

const severityIcons = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const severityTone: Record<Alert['severity'], StatusTone> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
}

/**
 * 告警列表项（事件行）。
 *
 * 精密仪器方向：
 * - 前缘状态轨用「形状」编码级别（实线/虚线/发丝），颜色只是第三通道；行不再整行染色
 * - 级别图标与状态徽标全部走令牌；徽标禁止折行
 * - 操作常驻（不再依赖悬停）；点击行打开详情弹窗
 */
export const AlertListItem: React.FC<AlertListItemProps> = ({
  alert,
  isSelected,
  onSelect,
  canUpdate = true,
  canDelete = true,
  onAcknowledge,
  onResolve,
  onDelete
}) => {
  const { getStatusColor, getStatusText } = useAlertStyles()
  const SeverityIcon = severityIcons[alert.severity]
  const tone = severityTone[alert.severity]
  const [isModalOpen, setIsModalOpen] = useState(false)

  const plain = useMemo(
    () => translateToPlainLanguage({
      message: alert.description,
      title: alert.title,
      level: alert.severity,
      facility: alert.category,
      deviceName: alert.device,
    }),
    [alert.description, alert.title, alert.severity, alert.category, alert.device],
  )

  // 未命中规则时兜底摘要信息量很低，直接用原文首行更有意义
  const summary = plain.matched ? plain.summary : alert.description

  const formatTimestamp = (value: string): string => {
    const raw = String(value ?? '').trim()
    if (!raw) return '-'
    return formatDateTimeYMDHMS(raw)
  }

  // 阻止复选框点击触发详情弹窗
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  // 阻止按钮点击触发详情弹窗
  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    action()
  }

  const handleDelete = () => {
    if (!onDelete) return
    const ok = confirm('确定要删除此告警吗？此操作不可恢复。')
    if (!ok) return
    onDelete(alert.id)
  }

  return (
    <>
      <div
        data-slot="alert-list-item"
        data-severity={alert.severity}
        className={cn(
          'flex items-stretch overflow-hidden rounded-lg border bg-card transition-colors duration-100 motion-reduce:transition-none hover:bg-surface-3 cursor-pointer',
          isSelected ? 'border-primary/40' : 'border-border',
        )}
        onClick={() => setIsModalOpen(true)}
      >
        <StatusRail tone={tone} />
        <div className="flex flex-1 items-center justify-between gap-3 px-3 py-2.5 min-w-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <input
              type="checkbox"
              className="custom-checkbox flex-shrink-0"
              checked={isSelected}
              onChange={() => onSelect(alert.id)}
              onClick={handleCheckboxClick}
              aria-label={`选择告警：${alert.title}`}
            />
            <SeverityIcon className={cn(
              'w-4 h-4 flex-shrink-0',
              tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-info'
            )} />

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-medium text-sm text-foreground truncate" title={alert.title}>
                  {alert.title}
                </h3>
                <span className={cn('px-1.5 py-0.5 text-xs font-medium rounded-md whitespace-nowrap flex-shrink-0', getStatusColor(alert.status))}>
                  {getStatusText(alert.status)}
                </span>
                <span className="px-1.5 py-0.5 text-xs bg-surface-3 text-muted-foreground rounded-md whitespace-nowrap flex-shrink-0">
                  {humanizeAlertCategory(alert.category)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Shield className="w-3 h-3" />
                  {alert.device}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0 tabular-nums">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(alert.timestamp)}
                </span>
                {alert.assignee && (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <User className="w-3 h-3" />
                    {alert.assignee}
                  </span>
                )}
                <span className="flex-1 min-w-0 truncate text-foreground/80" title={summary}>
                  {summary}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canUpdate && alert.status === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleButtonClick(e, () => onAcknowledge?.(alert.id))}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  确认
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleButtonClick(e, () => onResolve?.(alert.id))}
                >
                  解决
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => handleButtonClick(e, handleDelete)}
                aria-label="删除该告警"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 详情弹窗：处置建议、原文等细节在此查看 */}
      <AlertDetailModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        alert={alert}
        onAcknowledge={canUpdate ? onAcknowledge : undefined}
        onResolve={canUpdate ? onResolve : undefined}
        onDelete={canDelete ? onDelete : undefined}
      />
    </>
  )
}
