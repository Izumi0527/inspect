import React from 'react'
import { Shield } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { Pagination } from '@/components/atoms/pagination'
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
    onPageSizeChange?: (pageSize: number) => void
  }
  renderAsCard?: boolean // 是否渲染为独立Card，默认true保持向后兼容
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
  pagination,
  renderAsCard = true // 默认true保持向后兼容
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

  // 列表内容
  const listContent = (
    <>
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
          <Shield className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">没有找到匹配的告警</p>
        </div>
      )}

      {/* Pagination - 使用增强的分页组件 */}
      {pagination && alerts.length > 0 && (
        <div className="mt-6 pt-6 border-t dark:border-gray-700">
          <Pagination
            currentPage={pagination.current}
            totalPages={Math.ceil(pagination.total / pagination.pageSize)}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector={!!pagination.onPageSizeChange}
          />
        </div>
      )}
    </>
  )

  // 根据renderAsCard决定是否包裹Card
  if (renderAsCard) {
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
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedAlerts.length > 0 ? `已选择 ${selectedAlerts.length} 项` : '全选'}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {listContent}
        </CardContent>
      </Card>
    )
  }

  // 不使用Card时，直接返回列表内容
  return listContent
}