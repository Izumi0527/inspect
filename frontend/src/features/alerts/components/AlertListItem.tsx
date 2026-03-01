import React, { useState } from 'react'
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
import { Alert } from '../types'
import { useAlertStyles } from '../hooks/useAlerts'
import { AlertDetailModal } from './AlertDetailModal'

interface AlertListItemProps {
  alert: Alert
  isSelected: boolean
  onSelect: (id: string) => void
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
  onAcknowledge,
  onResolve,
  onDelete
}) => {
  const { getSeverityColor, getStatusColor, getStatusText } = useAlertStyles()
  const SeverityIcon = severityIcons[alert.severity]
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 阻止复选框点击触发详情弹窗
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  // 阻止按钮点击触发详情弹窗
  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    action()
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
                {alert.category}
              </span>
            </div>

            <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {alert.device}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {alert.timestamp}
              </div>
              {alert.assignee && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {alert.assignee}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {alert.status === 'active' && (
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
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleButtonClick(e, () => onDelete?.(alert.id))}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>

    {/* 详情弹窗 */}
    <AlertDetailModal
      open={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      alert={alert}
      onAcknowledge={onAcknowledge}
      onResolve={onResolve}
      onDelete={onDelete}
    />
  </>
  )
}