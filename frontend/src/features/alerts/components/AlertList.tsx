import React from 'react'
import { Alert } from '../types'
import { AlertListItem } from './AlertListItem'

export interface AlertListProps {
  alerts: Alert[]
  selectedAlerts: string[]
  onSelectAlert: (id: string) => void
  canUpdate?: boolean
  canDelete?: boolean
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
}

export const AlertList: React.FC<AlertListProps> = ({
  alerts,
  selectedAlerts,
  onSelectAlert,
  canUpdate = true,
  canDelete = true,
  onAcknowledge,
  onResolve,
  onDelete,
}) => {
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <AlertListItem
          key={alert.id}
          alert={alert}
          isSelected={selectedAlerts.includes(alert.id)}
          onSelect={onSelectAlert}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
