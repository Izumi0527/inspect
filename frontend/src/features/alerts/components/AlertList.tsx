import React from 'react'
import { Shield } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { Alert } from '../types'
import { AlertListItem } from './AlertListItem'

interface AlertListProps {
  alerts: Alert[]
  selectedAlerts: string[]
  onSelectAlert: (id: string) => void
  onSelectAll: (alertIds: string[]) => void
  onClearSelection: () => void
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
  pagination?: {
    current: number
    total: number
    pageSize: number
    onPageChange: (page: number) => void
  }
}

export const AlertList: React.FC<AlertListProps> = ({
  alerts,
  selectedAlerts,
  onSelectAlert,
  onSelectAll,
  onClearSelection,
  onAcknowledge,
  onResolve,
  onDelete,
  pagination
}) => {
  const allSelected = alerts.length > 0 && selectedAlerts.length === alerts.length
  const someSelected = selectedAlerts.length > 0 && selectedAlerts.length < alerts.length

  const handleSelectAll = () => {
    if (allSelected) {
      onClearSelection()
    } else {
      onSelectAll(alerts.map(alert => alert.id))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>告警列表</CardTitle>
          {alerts.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = someSelected
                }}
                onChange={handleSelectAll}
                className="rounded"
              />
              <span className="text-sm text-gray-600">
                {selectedAlerts.length > 0 ? `已选择 ${selectedAlerts.length} 项` : '全选'}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertListItem
              key={alert.id}
              alert={alert}
              isSelected={selectedAlerts.includes(alert.id)}
              onSelect={onSelectAlert}
              onAcknowledge={onAcknowledge}
              onResolve={onResolve}
              onDelete={onDelete}
            />
          ))}
        </div>

        {alerts.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">没有找到匹配的告警</p>
          </div>
        )}

        {/* Pagination */}
        {pagination && alerts.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600">
              显示 {Math.min(alerts.length, pagination.pageSize)} 项，共 {pagination.total} 项
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={pagination.current <= 1}
                onClick={() => pagination.onPageChange(pagination.current - 1)}
              >
                上一页
              </Button>
              <Button variant="outline" size="sm">
                {pagination.current}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={pagination.current * pagination.pageSize >= pagination.total}
                onClick={() => pagination.onPageChange(pagination.current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}