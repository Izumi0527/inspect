import React, { useState } from 'react'
import { Activity, Wifi, WifiOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/atoms'
import { probeDevice } from '../api/devices.api'
import { DeviceProbeResult } from '../types'
import toast from 'react-hot-toast'

interface DeviceProbeButtonProps {
  deviceId: number
  deviceName: string
  onProbeComplete?: (result: DeviceProbeResult) => void
  size?: 'sm' | 'lg' | 'default'
  variant?: 'default' | 'outline' | 'ghost'
  /** 是否隐藏按钮文字（表格操作列常用） */
  hideLabel?: boolean
  /** 是否允许后端写回探测状态（无 devices:update 权限时建议传 false） */
  updateStatus?: boolean
}

const PROBE_ERROR_MAX_LENGTH = 80

/**
 * 取后端探测错误文本的首行并截断。ping 的失败输出常是多行（错误 + 提示），
 * SNMP 错误也可能带长堆栈，原样塞进 toast 会把关键信息挤出可视区。
 */
export const summarizeProbeError = (
  error?: string | null,
  maxLength: number = PROBE_ERROR_MAX_LENGTH,
): string | null => {
  if (!error) return null
  const firstLine = error.split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? ''
  if (!firstLine) return null
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength)}…` : firstLine
}

/** 生成单条探测结论文本：状态 + 耗时 + （失败时）原因。 */
const describeProbeLeg = (
  reachable: boolean,
  labels: { ok: string; fail: string },
  responseTime?: number,
  error?: string | null,
): string => {
  const timing = responseTime ? ` (${responseTime.toFixed(1)}ms)` : ''
  const reason = reachable ? null : summarizeProbeError(error)
  return `${reachable ? labels.ok : labels.fail}${timing}${reason ? ` — ${reason}` : ''}`
}

const ICMP_LABELS = { ok: '在线', fail: '离线' }
const SNMP_LABELS = { ok: '成功', fail: '失败' }

export const DeviceProbeButton: React.FC<DeviceProbeButtonProps> = ({
  deviceId,
  deviceName,
  onProbeComplete,
  size = 'sm',
  variant = 'ghost',
  hideLabel = false,
  updateStatus = true,
}) => {
  const [probing, setProbing] = useState(false)
  const [result, setResult] = useState<DeviceProbeResult | null>(null)

  const handleProbe = async () => {
    setProbing(true)
    try {
      const probeResult = await probeDevice(deviceId, { updateStatus })
      setResult(probeResult)

      if (onProbeComplete) {
        onProbeComplete(probeResult)
      }

      // 显示探测结果；失败时附后端返回的原因，让「离线」能区分设备真离线与服务环境问题
      const icmpText = describeProbeLeg(
        probeResult.icmp_reachable, ICMP_LABELS, probeResult.icmp_response_time, probeResult.icmp_error,
      )
      const snmpText = describeProbeLeg(
        probeResult.snmp_reachable, SNMP_LABELS, probeResult.snmp_response_time, probeResult.snmp_error,
      )

      toast.success(
        `设备 ${deviceName} 探测完成\nICMP: ${icmpText}\nSNMP: ${snmpText}`,
        { duration: 4000 }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '探测失败'
      toast.error(message)
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size={size}
        variant={variant}
        onClick={handleProbe}
        disabled={probing}
        title="探测设备连接状态"
        aria-label={`探测设备 ${deviceName} 的连接状态`}
        // 表格操作列中通常是纯图标按钮，收紧横向内边距以降低占宽
        className={hideLabel ? 'px-2' : undefined}
      >
        {probing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Activity className="h-4 w-4" />
        )}
        {hideLabel ? (
          <span className="sr-only">探测</span>
        ) : (
          <span className="ml-1">探测</span>
        )}
      </Button>

      {result && !probing && (
        <div className="flex items-center gap-1">
          {/* ICMP 状态 */}
          <div title={`ICMP ${describeProbeLeg(result.icmp_reachable, ICMP_LABELS, result.icmp_response_time, result.icmp_error)}`}>
            {result.icmp_reachable ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>

          {/* SNMP 状态 */}
          <div title={`SNMP ${describeProbeLeg(result.snmp_reachable, SNMP_LABELS, result.snmp_response_time, result.snmp_error)}`}>
            {result.snmp_reachable ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground/80" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
