/**
 * 日志采集弹窗
 * - 支持选择设备（多选）
 * - 支持单台/批量采集
 * - 展示批量采集的成功/失败明细
 */
import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { fetchDevices } from '@/features/devices/api/devices.api'
import type { Device } from '@/features/devices/types'
import type { LogCollectionResponse } from '../types'

type ProgressStatus = 'pending' | 'collecting' | 'done' | 'error'

export interface LogCollectionModalProps {
  open: boolean
  onClose: () => void
  collecting: boolean
  progress: Record<number, ProgressStatus>
  onCollectSingle: (deviceId: number, options: { logType: string; maxEntries?: number }) => Promise<LogCollectionResponse>
  onCollectBatch: (deviceIds: number[], options: { logType: string; maxEntries?: number; maxConcurrent?: number }) => Promise<LogCollectionResponse>
  onAfterCollect?: () => Promise<void> | void
}

export const LogCollectionModal: React.FC<LogCollectionModalProps> = ({
  open,
  onClose,
  collecting,
  progress,
  onCollectSingle,
  onCollectBatch,
  onAfterCollect,
}) => {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [devicesLoading, setDevicesLoading] = React.useState(false)
  const [deviceSearch, setDeviceSearch] = React.useState('')
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState<number[]>([])

  const [logType, setLogType] = React.useState('system')
  const [maxEntries, setMaxEntries] = React.useState<number>(100)
  const [maxConcurrent, setMaxConcurrent] = React.useState<number>(5)

  const [lastResult, setLastResult] = React.useState<LogCollectionResponse | null>(null)

  const selectedSet = React.useMemo(() => new Set(selectedDeviceIds), [selectedDeviceIds])

  React.useEffect(() => {
    if (!open) return

    let canceled = false
    setDevicesLoading(true)

    void fetchDevices({
      search: deviceSearch || undefined,
      page: 1,
      page_size: 200,
    })
      .then((res) => {
        if (canceled) return
        setDevices(res.devices ?? [])
      })
      .catch(() => {
        if (canceled) return
        setDevices([])
      })
      .finally(() => {
        if (canceled) return
        setDevicesLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [open, deviceSearch])

  const toggleDevice = (deviceId: number) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId],
    )
  }

  const clearSelection = () => setSelectedDeviceIds([])

  const handleCollect = async () => {
    if (selectedDeviceIds.length === 0 || collecting) return

    setLastResult(null)
    const ids = [...selectedDeviceIds]

    const result =
      ids.length === 1
        ? await onCollectSingle(ids[0], { logType, maxEntries })
        : await onCollectBatch(ids, { logType, maxEntries, maxConcurrent })

    setLastResult(result)
    await onAfterCollect?.()
  }

  const renderDeviceStatus = (deviceId: number) => {
    const status = progress[deviceId]
    if (!status) return null
    switch (status) {
      case 'pending':
        return <span className="text-xs text-gray-500">等待中</span>
      case 'collecting':
        return <span className="text-xs text-blue-600">采集中</span>
      case 'done':
        return <span className="text-xs text-green-600">完成</span>
      case 'error':
        return <span className="text-xs text-red-600">失败</span>
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>采集日志</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">设备列表</div>
              <Button onClick={clearSelection} disabled={collecting || selectedDeviceIds.length === 0}>
                清空选择
              </Button>
            </div>

            <input
              value={deviceSearch}
              onChange={(e) => setDeviceSearch(e.target.value)}
              placeholder="搜索设备..."
              className="w-full px-3 py-2 border rounded"
            />

            <div className="border rounded max-h-64 overflow-auto">
              {devicesLoading ? (
                <div className="p-3 text-sm text-gray-500">加载中...</div>
              ) : devices.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">暂无设备</div>
              ) : (
                devices.map((device) => (
                  <label
                    key={device.id}
                    className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      aria-label={`选择设备-${device.id}`}
                      checked={selectedSet.has(device.id)}
                      onChange={() => toggleDevice(device.id)}
                      disabled={collecting}
                    />
                    <div className="flex-1">
                      <div className="text-sm">{device.name}</div>
                      <div className="text-xs text-gray-500">{device.ip}</div>
                    </div>
                    {renderDeviceStatus(device.id)}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">已选设备 ({selectedDeviceIds.length})</div>
              <div className="flex flex-wrap gap-2">
                {selectedDeviceIds.length === 0 ? (
                  <span className="text-sm text-gray-500">请先选择设备</span>
                ) : (
                  selectedDeviceIds.map((id) => (
                    <Badge key={id}>{devices.find((d) => d.id === id)?.name ?? `设备-${id}`}</Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">采集参数</div>

              <label className="block text-sm">
                日志类型
                <input
                  value={logType}
                  onChange={(e) => setLogType(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded"
                />
              </label>

              <label className="block text-sm">
                最大条数
                <input
                  type="number"
                  value={maxEntries}
                  onChange={(e) => setMaxEntries(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border rounded"
                />
              </label>

              {selectedDeviceIds.length > 1 && (
                <label className="block text-sm">
                  最大并发
                  <input
                    type="number"
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 border rounded"
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleCollect} disabled={collecting || selectedDeviceIds.length === 0}>
                开始采集
              </Button>
              <Button onClick={onClose} disabled={collecting}>
                关闭
              </Button>
            </div>

            {lastResult && (
              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-medium">采集结果</div>
                {lastResult.failed && Object.keys(lastResult.failed).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(lastResult.failed).map(([deviceId, reason]) => (
                      <div key={deviceId} className="text-sm text-red-600">
                        {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

