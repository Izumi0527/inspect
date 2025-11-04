import React, { useMemo, useState } from 'react'
import { AlertTriangle, Trash2, Server } from 'lucide-react'
import { Modal, Button, Card, CardContent, Badge, Loading } from '@/components/atoms'
import { Device } from '../types'

interface BulkDeviceDeleteProps {
  isOpen: boolean
  onClose: () => void
  selectedDevices: Device[]
  onConfirm: () => Promise<void>
  isProcessing: boolean
}

export const BulkDeviceDelete: React.FC<BulkDeviceDeleteProps> = ({
  isOpen,
  onClose,
  selectedDevices,
  onConfirm,
  isProcessing
}) => {
  const [confirmInput, setConfirmInput] = useState('')

  const devicesWithAlerts = useMemo(
    () => selectedDevices.filter(device => (device.alert_count ?? 0) > 0).length,
    [selectedDevices]
  )

  const isConfirmMatched = confirmInput.trim() === '确认删除'

  const handleClose = () => {
    if (isProcessing) return
    setConfirmInput('')
    onClose()
  }

  const handleConfirm = async () => {
    if (!isConfirmMatched || isProcessing) return
    await onConfirm()
    setConfirmInput('')
  }

  return (
    <Modal open={isOpen} onOpenChange={handleClose}>
      <div className="p-6">
        {/* 警告标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">确认批量删除</h2>
            <p className="text-sm text-gray-600 mt-1">
              此操作不可撤销，请确认是否要删除以下设备。
            </p>
          </div>
        </div>

        {/* 删除统计 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {selectedDevices.length}
                  </div>
                  <div className="text-sm text-gray-600">待删除设备</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-100">
                  <Server className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {devicesWithAlerts}
                  </div>
                  <div className="text-sm text-gray-600">存在告警的设备</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 设备列表 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="font-medium text-gray-900 mb-3">将被删除的设备列表：</h3>
            <div className="max-h-64 overflow-y-auto space-y-3">
              {selectedDevices.map(device => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        device.status === 'online'
                          ? 'success'
                          : device.status === 'offline'
                            ? 'error'
                            : 'warning'
                      }
                    >
                      {device.status}
                    </Badge>
                    <div>
                      <div className="font-medium text-gray-900">{device.name}</div>
                      <div className="text-sm text-gray-600">
                        {device.ip} · {device.device_type} · {device.location}
                      </div>
                    </div>
                  </div>
                  {(device.alert_count ?? 0) > 0 && (
                    <Badge variant="error">{device.alert_count} 条告警</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 风险提示 */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800 mb-1">删除前请确认以下风险：</h4>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                <li>设备删除后将无法恢复。</li>
                <li>相关的监控数据、巡检记录和告警历史将一并移除。</li>
                <li>如设备正在执行巡检任务，任务会被强制终止。</li>
                <li>建议在删除前备份必要的配置和数据。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 确认输入 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2" htmlFor="confirmInput">
            为确保操作安全，请输入 “确认删除” 以继续：
          </label>
          <input
            type="text"
            id="confirmInput"
            value={confirmInput}
            onChange={(event) => setConfirmInput(event.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="确认删除"
            disabled={isProcessing}
          />
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isProcessing || !isConfirmMatched}
            className="min-w-[120px]"
          >
            {isProcessing ? (
              <Loading size="sm" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                确认删除
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
