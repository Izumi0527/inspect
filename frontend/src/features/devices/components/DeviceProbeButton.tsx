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

      // 显示探测结果
      const icmpStatus = probeResult.icmp_reachable ? '在线' : '离线'
      const snmpStatus = probeResult.snmp_reachable ? '成功' : '失败'
      
      toast.success(
        `设备 ${deviceName} 探测完成\nICMP: ${icmpStatus}${probeResult.icmp_response_time ? ` (${probeResult.icmp_response_time.toFixed(1)}ms)` : ''}\nSNMP: ${snmpStatus}${probeResult.snmp_response_time ? ` (${probeResult.snmp_response_time.toFixed(1)}ms)` : ''}`,
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
          <div title={`ICMP ${result.icmp_reachable ? '在线' : '离线'}${result.icmp_response_time ? ` (${result.icmp_response_time.toFixed(1)}ms)` : ''}`}>
            {result.icmp_reachable ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>

          {/* SNMP 状态 */}
          <div title={`SNMP ${result.snmp_reachable ? '成功' : '失败'}${result.snmp_response_time ? ` (${result.snmp_response_time.toFixed(1)}ms)` : ''}`}>
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
