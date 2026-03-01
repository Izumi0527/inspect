import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, GitCompare, AlertCircle } from 'lucide-react'
import {
  Badge,
  Button,
  SimpleInput as Input,
  Loading
} from '@/components/atoms'
import toast from 'react-hot-toast'
import { useCompareDeviceReports } from '../hooks/useReports'

interface Props {
  onClose: () => void
}

const toRecord = (value: unknown): Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as any) : {}

const toNumberSafe = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatDelta = (value: unknown): string => {
  const n = toNumberSafe(value, 0)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

const parseIdList = (raw: string): string[] => {
  const text = String(raw || '').trim()
  if (!text) return []
  const parts = text.split(/[,\uFF0C]+/g)
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const v = part.trim()
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    result.push(v)
  }
  return result
}

export const InspectionCompareModal: React.FC<Props> = ({ onClose }) => {
  const [deviceIdsText, setDeviceIdsText] = useState('')
  const [dateRange, setDateRange] = useState(() => {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return { startDate, endDate }
  })
  const [result, setResult] = useState<unknown>(null)

  const compareMutation = useCompareDeviceReports()
  const isLoading = compareMutation.isPending

  const deviceIds = useMemo(() => parseIdList(deviceIdsText), [deviceIdsText])

  const handleCompare = async () => {
    if (deviceIds.length < 2) {
      toast.error('请至少输入 2 个设备ID')
      return
    }
    try {
      const data = await compareMutation.mutateAsync({
        deviceIds,
        dateRange
      })
      setResult(data)
    } catch (err) {
      console.error('设备对比失败:', err)
    }
  }

  const payload = toRecord(result)
  const devices = Array.isArray(payload.devices) ? payload.devices : []
  const comparisons = Array.isArray(payload.comparisons) ? payload.comparisons : []

  const byDeviceId = useMemo(() => {
    const map = new Map<string, any>()
    for (const item of devices) {
      const rec = toRecord(item)
      const id = String(rec.device_id ?? rec.deviceId ?? '')
      if (id) map.set(id, rec)
    }
    return map
  }, [devices])

  const baseDevice = devices.length > 0 ? toRecord(devices[0]) : null
  const baseId = baseDevice ? String(baseDevice.device_id ?? baseDevice.deviceId ?? '') : ''

  const severityBadge = (status: string) => {
    const normalized = String(status || '').toLowerCase()
    if (normalized === 'online') return <Badge variant="success">在线</Badge>
    if (normalized === 'warning') return <Badge variant="warning">告警</Badge>
    if (normalized === 'error') return <Badge variant="danger">错误</Badge>
    return <Badge variant="secondary">离线</Badge>
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b dark:border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <GitCompare className="w-6 h-6 text-green-600 dark:text-green-400" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">设备对比</h2>
              <p className="text-sm text-muted-foreground">差异以“第一个设备”为基准</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                设备ID（逗号分隔，至少2个）
              </label>
              <Input
                value={deviceIdsText}
                onChange={(e) => setDeviceIdsText(e.target.value)}
                placeholder="例如：1,2,3"
                disabled={isLoading}
              />
              <div className="text-xs text-muted-foreground mt-1">
                已识别：{deviceIds.length} 个
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                开始日期
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                结束日期
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                disabled={isLoading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCompare} disabled={isLoading} className="w-full">
                {isLoading ? '对比中...' : '开始对比'}
              </Button>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loading />
              <span className="ml-2 text-muted-foreground">计算对比数据中...</span>
            </div>
          )}

          {!isLoading && !!result && (
            <div className="space-y-4">
              {/* 基准设备 */}
              {baseDevice && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">基准设备</div>
                      <div className="text-base font-medium text-blue-900 dark:text-blue-200">
                        #{String(baseDevice.device_id ?? baseDevice.deviceId)} {String(baseDevice.device_name ?? baseDevice.deviceName ?? '')}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        类型：{String(baseDevice.device_type ?? baseDevice.deviceType ?? '-')}
                      </div>
                    </div>
                    <div>{severityBadge(String(baseDevice.status))}</div>
                  </div>
                </div>
              )}

              {/* 设备指标表 */}
              {devices.length > 0 ? (
                <div className="border dark:border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/40 px-4 py-3 border-b dark:border-border font-medium text-foreground">
                    设备指标
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/60 dark:bg-muted/80">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">设备</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">状态</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">通过率</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">平均分</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">可用性</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">平均响应(ms)</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">失败检查</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devices.map((item: any, idx: number) => {
                          const rec = toRecord(item)
                          const id = String(rec.device_id ?? rec.deviceId ?? '')
                          const metrics = toRecord(rec.metrics)
                          const isBase = id && id === baseId
                          return (
                            <tr key={id || idx} className="border-t dark:border-border">
                              <td className="px-4 py-2 text-sm text-foreground">
                                <div className="font-medium">
                                  {isBase ? '基准 ' : ''}#{id} {String(rec.device_name ?? rec.deviceName ?? '')}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {String(rec.device_type ?? rec.deviceType ?? '-')}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm">{severityBadge(String(rec.status))}</td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">
                                {toNumberSafe(metrics.pass_rate).toFixed(2)}%
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">
                                {toNumberSafe(metrics.avg_score).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">
                                {toNumberSafe(metrics.availability).toFixed(2)}%
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">
                                {toNumberSafe(metrics.avg_response_time).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">
                                {toNumberSafe(metrics.failed_checks).toFixed(0)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  未返回可对比的设备数据
                </div>
              )}

              {/* 差异表 */}
              {comparisons.length > 0 && (
                <div className="border dark:border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/40 px-4 py-3 border-b dark:border-border font-medium text-foreground">
                    差异（相对基准）
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/60 dark:bg-muted/80">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">对比设备</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">通过率</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">平均分</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">可用性</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">平均响应</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">失败检查</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisons.map((item: any, idx: number) => {
                          const rec = toRecord(item)
                          const compareId = String(rec.compare_device_id ?? rec.compareDeviceId ?? '')
                          const diff = toRecord(rec.diff)
                          const device = compareId ? byDeviceId.get(compareId) : null
                          const name = device ? String(device.device_name ?? device.deviceName ?? '') : ''
                          return (
                            <tr key={compareId || idx} className="border-t dark:border-border">
                              <td className="px-4 py-2 text-sm text-foreground">
                                <div className="font-medium">#{compareId} {name}</div>
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">{formatDelta(diff.pass_rate)}%</td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">{formatDelta(diff.avg_score)}</td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">{formatDelta(diff.availability)}%</td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">{formatDelta(diff.avg_response_time)}</td>
                              <td className="px-4 py-2 text-sm text-right text-foreground">{formatDelta(diff.failed_checks)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t dark:border-border bg-muted/40 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            关闭
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

