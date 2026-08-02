import React, { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Shield,
  Clock,
  User,
  CheckCircle,
  Lightbulb,
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
      level: alert.severity,
      facility: alert.category,
      deviceName: alert.device,
    }),
    [alert.description, alert.severity, alert.category, alert.device],
  )

  // null 表示用户尚未手动切换，此时跟随翻译结果：
  // 未命中规则时兜底文案信息量很低，直接把原文亮出来才有意义。
  const [rawOverride, setRawOverride] = useState<boolean | null>(null)
  const showRaw = rawOverride ?? !plain.matched

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
        className={`border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${getSeverityColor(alert.severity)}`}
        onClick={() => setIsModalOpen(true)}
      >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            className="mt-1 rounded"
            checked={isSelected}
            onChange={() => onSelect(alert.id)}
            onClick={handleCheckboxClick}
          />
          <SeverityIcon className={`w-5 h-5 mt-0.5 ${
            alert.severity === 'critical' ? 'text-red-600' :
            alert.severity === 'warning' ? 'text-yellow-600' : 'text-blue-600'
          }`} />
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="font-semibold text-foreground">{alert.title}</h3>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(alert.status)}`}>
                {getStatusText(alert.status)}
              </span>
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-muted-foreground rounded-full">
                {humanizeAlertCategory(alert.category)}
              </span>
            </div>

            <div className="mb-2 space-y-1.5">
              {/* 人话解读 */}
              <p className="text-sm text-foreground/90 leading-relaxed">{plain.summary}</p>

              {/* 处置建议：告警需要尽快处置，故在列表层即给出而非藏进详情 */}
              {plain.suggestion && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
                  <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                  <span>建议：{plain.suggestion}</span>
                </p>
              )}

              {/* 设备原文：默认收起 */}
              {showRaw && (
                <p className="p-2 rounded bg-muted/60 text-xs text-muted-foreground font-mono break-all whitespace-pre-wrap">
                  {alert.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {alert.device}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimestamp(alert.timestamp)}
              </div>
              {alert.assignee && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {alert.assignee}
                </div>
              )}

              {/* 原文就地切换：不打开详情弹窗 */}
              <button
                type="button"
                aria-expanded={showRaw}
                aria-label={showRaw ? `收起告警 ${alert.id} 的原始信息` : `展开告警 ${alert.id} 的原始信息`}
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

    {/* 详情弹窗 */}
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
