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

/**
 * 告警列表项（紧凑两行）
 *
 * 列表只放"扫一眼就要知道"的信息：标题、状态、分类、设备、时间与一行摘要。
 * 处置建议、原文全文等细节由详情弹窗承载，点击卡片任意位置打开。
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
  const { getSeverityColor, getStatusColor, getStatusText } = useAlertStyles()
  const SeverityIcon = severityIcons[alert.severity]
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
        className={`border dark:border-gray-700 rounded-lg px-4 py-2.5 hover:shadow-md transition-shadow cursor-pointer ${getSeverityColor(alert.severity)}`}
        onClick={() => setIsModalOpen(true)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <input
              type="checkbox"
              className="rounded flex-shrink-0"
              checked={isSelected}
              onChange={() => onSelect(alert.id)}
              onClick={handleCheckboxClick}
            />
            <SeverityIcon className={`w-5 h-5 flex-shrink-0 ${
              alert.severity === 'critical' ? 'text-red-600' :
              alert.severity === 'warning' ? 'text-yellow-600' : 'text-blue-600'
            }`} />

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-foreground truncate" title={alert.title}>
                  {alert.title}
                </h3>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${getStatusColor(alert.status)}`}>
                  {getStatusText(alert.status)}
                </span>
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-muted-foreground rounded-full flex-shrink-0">
                  {humanizeAlertCategory(alert.category)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Shield className="w-3 h-3" />
                  {alert.device}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
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
                  <CheckCircle className="w-4 h-4 mr-1" />
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
                onClick={(e) => handleButtonClick(e, handleDelete)}
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
