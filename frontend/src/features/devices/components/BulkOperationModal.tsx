import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle,
  X,
  Settings,
  Trash2,
  Users
} from 'lucide-react'
import {
  Button,
  Modal,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge
} from '@/components/atoms'
import { Device, BulkActionType, BulkActionParams, BulkOperationResult } from '../types'
import { BulkDeviceUpdate } from './BulkDeviceUpdate'
import { BulkDeviceDelete } from './BulkDeviceDelete'

interface BulkOperationModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDevices: number[]
  devices: Device[]
  onBulkAction: (action: BulkActionType, params?: BulkActionParams) => Promise<BulkOperationResult>
  onClearSelection: () => void
}

export const BulkOperationModal: React.FC<BulkOperationModalProps> = ({
  isOpen,
  onClose,
  selectedDevices,
  devices,
  onBulkAction,
  onClearSelection
}) => {
  const [activeOperation, setActiveOperation] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [operationResult, setOperationResult] = useState<BulkOperationResult | null>(null)

  const selectedDeviceData = devices.filter(device => selectedDevices.includes(device.id))

  const handleOperationComplete = (result: BulkOperationResult) => {
    setOperationResult(result)
    setIsProcessing(false)
    if (result.success) {
      setTimeout(() => {
        onClearSelection()
        onClose()
      }, 2000)
    }
  }

  const handleBulkDelete = async () => {
    setIsProcessing(true)
    try {
      const result = await onBulkAction('batch_delete', {
        device_ids: selectedDevices
      })
      handleOperationComplete(result)
    } catch (error) {
      handleOperationComplete({
        success: false,
        processed_count: 0,
        failed_count: selectedDevices.length,
        errors: [{ error: error instanceof Error ? error.message : '删除失败' }],
        message: '批量删除操作失败'
      })
    }
  }

  const handleBulkInspection = async () => {
    setIsProcessing(true)
    try {
      const result = await onBulkAction('start_inspection', {
        device_ids: selectedDevices
      })
      handleOperationComplete(result)
    } catch (error) {
      handleOperationComplete({
        success: false,
        processed_count: 0,
        failed_count: selectedDevices.length,
        errors: [{ error: error instanceof Error ? error.message : '启动巡检失败' }],
        message: '批量巡检操作失败'
      })
    }
  }

  const getBulkOperations = () => [
    {
      id: 'inspect',
      title: '批量巡检',
      description: '对选中设备执行巡检任务',
      icon: CheckCircle,
      variant: 'primary' as const,
      action: handleBulkInspection
    },
    {
      id: 'update',
      title: '批量更新',
      description: '批量修改设备属性',
      icon: Settings,
      variant: 'secondary' as const,
      action: () => setActiveOperation('update')
    },
    {
      id: 'group',
      title: '分组管理',
      description: '批量添加/移除设备分组',
      icon: Users,
      variant: 'secondary' as const,
      action: () => setActiveOperation('group')
    },
    {
      id: 'delete',
      title: '批量删除',
      description: '删除所选设备（不可恢复）',
      icon: Trash2,
      variant: 'destructive' as const,
      action: () => setActiveOperation('delete')
    }
  ]

  if (operationResult) {
    return (
      <Modal open={isOpen} onOpenChange={onClose}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            {operationResult.success ? (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            ) : (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {operationResult.success ? '操作完成' : '操作失败'}
              </h3>
              <p className="text-sm text-gray-600">{operationResult.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {operationResult.processed_count}
                  </div>
                  <div className="text-sm text-gray-600">成功处理</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {operationResult.failed_count}
                  </div>
                  <div className="text-sm text-gray-600">处理失败</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {operationResult.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">错误详情：</h4>
              <div className="max-h-32 overflow-y-auto bg-red-50 rounded-lg p-3">
                {operationResult.errors.map((error, index) => (
                  <div key={index} className="text-sm text-red-700 mb-1">
                    {error.device_name && `设备 ${error.device_name}: `}
                    {error.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (activeOperation === 'delete') {
    return (
      <BulkDeviceDelete
        isOpen={isOpen}
        onClose={() => {
          setActiveOperation('')
          onClose()
        }}
        selectedDevices={selectedDeviceData}
        onConfirm={handleBulkDelete}
        isProcessing={isProcessing}
      />
    )
  }

  if (activeOperation === 'update') {
    return (
      <BulkDeviceUpdate
        isOpen={isOpen}
        onClose={() => {
          setActiveOperation('')
          onClose()
        }}
        selectedDevices={selectedDeviceData}
        onBulkUpdate={async (updates) => {
          setIsProcessing(true)
          try {
            const result = await onBulkAction('batch_update', {
              device_ids: selectedDevices,
              updates
            })
            handleOperationComplete(result)
          } catch (error) {
            handleOperationComplete({
              success: false,
              processed_count: 0,
              failed_count: selectedDevices.length,
              errors: [{ error: error instanceof Error ? error.message : '更新失败' }],
              message: '批量更新操作失败'
            })
          }
        }}
        isProcessing={isProcessing}
      />
    )
  }

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">批量操作</h2>
            <p className="text-sm text-gray-600 mt-1">
              已选择 {selectedDevices.length} 个设备
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">选中的设备</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-32 overflow-y-auto">
              <div className="space-y-2">
                {selectedDeviceData.slice(0, 5).map((device) => (
                  <div key={device.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{device.device_type}</Badge>
                    <span className="font-medium">{device.name}</span>
                    <span className="text-gray-500">({device.ip})</span>
                  </div>
                ))}
                {selectedDeviceData.length > 5 && (
                  <div className="text-sm text-gray-500">
                    还有 {selectedDeviceData.length - 5} 个设备...
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {getBulkOperations().map((operation) => {
            const IconComponent = operation.icon
            return (
              <motion.div
                key={operation.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={operation.action}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`
                        flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                        ${operation.variant === 'primary' ? 'bg-blue-100' : ''}
                        ${operation.variant === 'secondary' ? 'bg-gray-100' : ''}
                        ${operation.variant === 'destructive' ? 'bg-red-100' : ''}
                      `}>
                        <IconComponent className={`
                          h-5 w-5
                          ${operation.variant === 'primary' ? 'text-blue-600' : ''}
                          ${operation.variant === 'secondary' ? 'text-gray-600' : ''}
                          ${operation.variant === 'destructive' ? 'text-red-600' : ''}
                        `} />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {operation.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {operation.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClearSelection}
          >
            清除选择
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
          >
            取消
          </Button>
        </div>
      </div>
    </Modal>
  )
}
