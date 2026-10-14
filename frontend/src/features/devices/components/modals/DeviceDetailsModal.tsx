'use client'

import React from 'react'
import {
  SimpleModal,
  Badge,
  Button,
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Device, DeviceSNMPExtensions } from '../../types'
import {
  healthCheckDevice,
  fetchDevicePerformance,
  fetchDeviceSNMPExtensions,
  fetchDeviceSSHHostKey,
  resetDeviceSSHHostKey,
  DeviceSSHHostKeyInfo,
} from '../../api/devices.api'
import { formatDate } from '@/utils/formatters'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import toast from 'react-hot-toast'

const PERFORMANCE_RANGES = [
  { value: '24h', label: '近24小时' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
]

const formatPercentageValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null) {
    return '-'
  }
  if (value >= 0 && value < 1) {
    return `${(value * 100).toFixed(1)}%`
  }
  return `${value.toFixed(1)}%`
}

const formatLastSeen = (lastSeen: string | undefined | null): string => {
  if (!lastSeen) {
    return '未知'
  }
  return formatDate(lastSeen, 'datetime')
}

const formatNumberWithUnit = (
  value: number | undefined | null,
  unit?: string | null,
): string => {
  if (value === undefined || value === null) {
    return '-'
  }
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return unit ? `${formatted} ${unit}` : formatted
}

const formatDurationSeconds = (seconds: number | undefined | null): string => {
  if (seconds === undefined || seconds === null) {
    return '-'
  }
  return `${seconds} 秒`
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return undefined
}

const formatConfigured = (configured?: boolean) => (configured ? '已配置' : '未配置')

const getCliConfiguration = (device: Device) => {
  const protocol = device.cli_protocol ?? 'none'
  const sshConfig = device.ssh_config
  const telnetConfig = device.telnet_config

  if (protocol === 'ssh') {
    return {
      protocolLabel: 'SSH',
      username: device.ssh_username || sshConfig?.username || '未配置',
      port: sshConfig?.port || device.ssh_port || 22,
      credentialStatus: formatConfigured(sshConfig?.password_configured || sshConfig?.private_key_configured),
      extraLabel: sshConfig?.use_key_auth ? '私钥状态' : '密码状态',
      extraValue: sshConfig?.use_key_auth
        ? formatConfigured(sshConfig?.private_key_configured)
        : formatConfigured(sshConfig?.password_configured),
    }
  }

  if (protocol === 'telnet') {
    return {
      protocolLabel: 'Telnet',
      username: telnetConfig?.username || '未配置',
      port: telnetConfig?.port ?? 23,
      credentialStatus: formatConfigured(telnetConfig?.password_configured || telnetConfig?.enable_password_configured),
      extraLabel: 'Enable 状态',
      extraValue: formatConfigured(telnetConfig?.enable_password_configured),
    }
  }

  return {
    protocolLabel: '未使用 CLI',
    username: '未使用 CLI',
    port: '-',
    credentialStatus: '未使用 CLI',
    extraLabel: '凭据状态',
    extraValue: '未使用 CLI',
  }
}

const getSnmpConfiguration = (device: Device) => {
  const version = device.snmp_config?.version ?? (device.snmp_version === '3' ? 'v3' : 'v2c')
  const port = device.snmp_config?.port ?? 161

  if (version === 'v3') {
    return {
      versionLabel: 'SNMPv3',
      port,
      credentialStatus: formatConfigured(
        device.snmp_config?.v3_config?.auth_password_configured ||
        device.snmp_config?.v3_config?.priv_password_configured ||
        !!device.snmp_config?.v3_config?.username,
      ),
      extraLabel: '安全级别',
      extraValue: device.snmp_config?.v3_config?.security_level ?? 'noAuthNoPriv',
    }
  }

  return {
    versionLabel: 'SNMPv2c',
    port,
    credentialStatus: formatConfigured(
      device.snmp_config?.v2c_config?.community_configured ||
      device.snmp_config?.v2c_config?.write_community_configured,
    ),
    extraLabel: '写凭据状态',
    extraValue: formatConfigured(device.snmp_config?.v2c_config?.write_community_configured),
  }
}

interface DeviceDetailsModalProps {
  isOpen: boolean
  device: Device | null
  loading: boolean
  onClose: () => void
  /**
   * 是否允许健康检查写回设备探测状态（默认 true）。
   * 只读用户建议传 false，避免产生写库行为或触发后端权限拦截。
   */
  updateStatus?: boolean
  /**
   * 是否允许重置 SSH 主机密钥指纹（写操作，默认 true）。
   * 只读用户建议传 false，按钮会禁用而非触发后端 403。
   */
  canResetHostKey?: boolean
}

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
)

export const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({
  isOpen,
  device,
  loading,
  onClose,
  updateStatus = true,
  canResetHostKey = true,
}) => {
  const [healthLoading, setHealthLoading] = React.useState(false)
  const [healthResult, setHealthResult] = React.useState<Record<string, unknown> | null>(null)
  const [healthError, setHealthError] = React.useState<string | null>(null)
  const [timeRange, setTimeRange] = React.useState('24h')
  const [performanceLoading, setPerformanceLoading] = React.useState(false)
  const [performanceError, setPerformanceError] = React.useState<string | null>(null)
  const [performanceData, setPerformanceData] = React.useState<Record<string, unknown> | null>(null)
  const [snmpExtensionsLoading, setSnmpExtensionsLoading] = React.useState(false)
  const [snmpExtensionsError, setSnmpExtensionsError] = React.useState<string | null>(null)
  const [snmpExtensionsData, setSnmpExtensionsData] = React.useState<DeviceSNMPExtensions | null>(null)
  const [hostKeyLoading, setHostKeyLoading] = React.useState(false)
  const [hostKeyError, setHostKeyError] = React.useState<string | null>(null)
  const [hostKeyInfo, setHostKeyInfo] = React.useState<DeviceSSHHostKeyInfo | null>(null)
  const [hostKeyResetConfirming, setHostKeyResetConfirming] = React.useState(false)
  const [hostKeyResetLoading, setHostKeyResetLoading] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen || !device) {
      setHealthResult(null)
      setHealthError(null)
      setPerformanceData(null)
      setPerformanceError(null)
      setSnmpExtensionsData(null)
      setSnmpExtensionsError(null)
      setHostKeyInfo(null)
      setHostKeyError(null)
      setHostKeyResetConfirming(false)
      setTimeRange('24h')
      return
    }

    let cancelled = false
    setPerformanceLoading(true)
    setPerformanceError(null)
    setSnmpExtensionsLoading(true)
    setSnmpExtensionsError(null)
    setHostKeyLoading(true)
    setHostKeyError(null)
    setHostKeyResetConfirming(false)

    fetchDevicePerformance(device.id, timeRange)
      .then((result) => {
        if (!cancelled) {
          setPerformanceData(result)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '加载性能数据失败'
          setPerformanceError(message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPerformanceLoading(false)
        }
      })

    fetchDeviceSNMPExtensions(device.id)
      .then((result) => {
        if (!cancelled) {
          setSnmpExtensionsData(result)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '加载 SNMP 扩展摘要失败'
          setSnmpExtensionsError(message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSnmpExtensionsLoading(false)
        }
      })

    fetchDeviceSSHHostKey(device.id)
      .then((result) => {
        if (!cancelled) {
          setHostKeyInfo(result)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '加载主机密钥指纹失败'
          setHostKeyError(message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHostKeyLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [device, isOpen, timeRange])

  const handleHealthCheck = async () => {
    if (!device) return

    setHealthLoading(true)
    setHealthError(null)
    try {
      const result = await healthCheckDevice(device.id, { updateStatus })
      setHealthResult(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '健康检查失败'
      setHealthError(message)
    } finally {
      setHealthLoading(false)
    }
  }

  const handleResetHostKey = async () => {
    if (!device) return

    setHostKeyResetLoading(true)
    try {
      await resetDeviceSSHHostKey(device.id)
      // 重置后本地置为未记录态：下一次采集会重新走 TOFU 首次信任并记录新指纹。
      setHostKeyInfo({
        device_id: device.id,
        fingerprint: null,
        algorithm: null,
        created_at: null,
        updated_at: null,
      })
      setHostKeyResetConfirming(false)
      toast.success('已重置主机密钥指纹，下次采集将重新信任设备当前密钥')
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置主机密钥指纹失败'
      toast.error(message)
    } finally {
      setHostKeyResetLoading(false)
    }
  }

  const renderContent = () => {
    if (loading) {
      return <div className="py-10 text-center text-muted-foreground">正在加载设备信息...</div>
    }

    if (!device) {
      return <div className="py-10 text-center text-muted-foreground">未找到设备信息</div>
    }

    const cliInfo = getCliConfiguration(device)
    const snmpInfo = getSnmpConfiguration(device)
    const currentMetrics = (performanceData?.current ?? {}) as Record<string, unknown>
    const history = Array.isArray(performanceData?.history) ? performanceData?.history : []
    const currentCpu = toNumber(currentMetrics.cpu_usage) ?? device.cpu_usage ?? null
    const currentMemory = toNumber(currentMetrics.memory_usage) ?? device.memory_usage ?? null
    const currentTemperature = toNumber(currentMetrics.temperature) ?? null
    const snmpExtensions = snmpExtensionsData ?? {
      device_id: device.id,
      timestamp: null,
      bgp_peers: [],
      optical_transceivers: [],
    }
    const establishedBGPPeerCount = snmpExtensions.bgp_peers.filter(
      (peer) => peer.state_label === 'established',
    ).length
    const hasSNMPExtensionDetails =
      snmpExtensions.bgp_peers.length > 0 ||
      snmpExtensions.optical_transceivers.length > 0

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl font-semibold">
            {device.name?.slice(0, 2)?.toUpperCase() || 'NA'}
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">{device.name}</p>
            <p className="text-sm text-muted-foreground">{device.description || '未填写描述'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="设备类型" value={getDeviceTypeLabel(device.device_type)} />
          <InfoRow label="运行状态" value={<Badge variant="outline">{device.status}</Badge>} />
          <InfoRow label="IP 地址" value={device.ip} />
          <InfoRow label="所在位置" value={device.location || '未设置'} />
          <InfoRow label="设备型号" value={device.model || '未采集到'} />
          <InfoRow label="软件版本" value={device.firmware_version || '未采集到'} />
          <InfoRow label="CPU 使用率" value={formatPercentageValue(currentCpu)} />
          <InfoRow label="内存使用率" value={formatPercentageValue(currentMemory)} />
          <InfoRow label="最近在线时间" value={formatLastSeen(device.last_seen)} />
          <InfoRow label="累计告警" value={device.alert_count ?? 0} />
        </div>

        <div className="border rounded-xl p-4 bg-muted/40">
          <p className="text-sm font-semibold text-foreground/90 mb-2">连接配置</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <InfoRow label="SNMP 版本" value={snmpInfo.versionLabel} />
            <InfoRow label="SNMP 端口" value={snmpInfo.port} />
            <InfoRow label="SNMP 凭据状态" value={snmpInfo.credentialStatus} />
            <InfoRow label={snmpInfo.extraLabel} value={snmpInfo.extraValue} />
            <InfoRow label="连接协议" value={cliInfo.protocolLabel} />
            <InfoRow label="CLI 用户名" value={cliInfo.username} />
            <InfoRow label="CLI 凭据状态" value={cliInfo.credentialStatus} />
            <InfoRow label="CLI 端口" value={cliInfo.port} />
            <InfoRow label={cliInfo.extraLabel} value={cliInfo.extraValue} />
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-muted/40 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground/90">SSH 主机密钥指纹</p>
            <p className="text-xs text-muted-foreground">
              日志采集首次 SSH 连接时记录（TOFU 首次信任）。设备指纹变化会拒绝连接，
              确认设备合法变更（如设备重置/更换）后可重置。
            </p>
          </div>

          {hostKeyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {hostKeyError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow
              label="指纹"
              value={
                hostKeyLoading ? (
                  '加载中...'
                ) : hostKeyInfo?.fingerprint ? (
                  <span className="font-mono break-all">{hostKeyInfo.fingerprint}</span>
                ) : (
                  '尚未记录（首次连接时自动记录）'
                )
              }
            />
            <InfoRow
              label="算法"
              value={hostKeyLoading ? '加载中...' : (hostKeyInfo?.algorithm || '-')}
            />
            <InfoRow
              label="记录时间"
              value={
                hostKeyLoading
                  ? '加载中...'
                  : hostKeyInfo?.created_at
                    ? formatDate(hostKeyInfo.created_at, 'datetime')
                    : '-'
              }
            />
          </div>

          {hostKeyResetConfirming ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-3">
              <p className="text-sm text-amber-800">
                重置后，下一次采集将信任设备当前出示的密钥。请先确认设备变更为合法操作
                （如设备重置/更换），否则可能引入中间人风险。
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={handleResetHostKey}
                  disabled={hostKeyResetLoading}
                >
                  {hostKeyResetLoading ? '重置中...' : '确认重置'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setHostKeyResetConfirming(false)}
                  disabled={hostKeyResetLoading}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setHostKeyResetConfirming(true)}
              disabled={!canResetHostKey || hostKeyLoading}
              title={canResetHostKey ? undefined : '需要设备更新权限'}
            >
              重置指纹
            </Button>
          )}
        </div>

        <div className="border rounded-xl p-4 bg-muted/40 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground/90">健康检查与性能</p>
              <p className="text-xs text-muted-foreground">查看实时连通性与设备性能快照</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[140px]" aria-label="性能时间范围">
                  <SelectValue placeholder="选择时间范围" />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_RANGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleHealthCheck} disabled={healthLoading}>
                {healthLoading ? '检查中...' : '执行健康检查'}
              </Button>
            </div>
          </div>

          {healthError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {healthError}
            </div>
          )}

          {healthResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="健康状态" value={String(healthResult.status ?? '未知')} />
              <InfoRow label="检查时间" value={formatLastSeen(String(healthResult.probed_at ?? ''))} />
              <InfoRow label="ICMP 连通性" value={healthResult.icmp_reachable ? '在线' : '离线'} />
              <InfoRow label="SNMP 连通性" value={healthResult.snmp_reachable ? '成功' : '失败'} />
            </div>
          )}

          {performanceError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {performanceError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoRow label="当前 CPU" value={performanceLoading ? '加载中...' : formatPercentageValue(currentCpu)} />
            <InfoRow label="当前内存" value={performanceLoading ? '加载中...' : formatPercentageValue(currentMemory)} />
            <InfoRow label="当前温度" value={performanceLoading ? '加载中...' : (currentTemperature != null ? `${currentTemperature.toFixed(1)}°C` : '-')} />
            <InfoRow label="性能点数" value={performanceLoading ? '加载中...' : history.length} />
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-muted/40 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground/90">SNMP 扩展摘要</p>
            <p className="text-xs text-muted-foreground">
              展示最近一次采集到的 BGP 邻居与光模块诊断摘要
            </p>
          </div>

          {snmpExtensionsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {snmpExtensionsError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoRow
              label="BGP 邻居数"
              value={snmpExtensionsLoading ? '加载中...' : snmpExtensions.bgp_peers.length}
            />
            <InfoRow
              label="已建立邻居"
              value={snmpExtensionsLoading ? '加载中...' : establishedBGPPeerCount}
            />
            <InfoRow
              label="光模块数量"
              value={snmpExtensionsLoading ? '加载中...' : snmpExtensions.optical_transceivers.length}
            />
            <InfoRow
              label="最近采集时间"
              value={snmpExtensionsLoading ? '加载中...' : formatLastSeen(snmpExtensions.timestamp)}
            />
          </div>

          {!snmpExtensionsLoading && !hasSNMPExtensionDetails && !snmpExtensionsError && (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              暂无 SNMP 扩展摘要
            </div>
          )}

          {!snmpExtensionsLoading && snmpExtensions.bgp_peers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">BGP 邻居</p>
              <div className="space-y-2">
                {snmpExtensions.bgp_peers.map((peer) => (
                  <div
                    key={`bgp-${peer.index}`}
                    className="rounded-lg border border-border/70 bg-background/80 p-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <InfoRow label="索引" value={peer.index} />
                      <InfoRow label="状态" value={peer.state_label || '-'} />
                      <InfoRow
                        label="建立时长"
                        value={formatDurationSeconds(peer.established_time_seconds)}
                      />
                      <InfoRow label="最近错误" value={peer.last_error || '-'} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!snmpExtensionsLoading && snmpExtensions.optical_transceivers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">光模块诊断</p>
              <div className="space-y-2">
                {snmpExtensions.optical_transceivers.map((item) => (
                  <div
                    key={`optical-${item.index}`}
                    className="rounded-lg border border-border/70 bg-background/80 p-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <InfoRow label="索引" value={item.index} />
                      <InfoRow
                        label="偏置电流"
                        value={formatNumberWithUnit(item.bias_current, item.bias_current_unit)}
                      />
                      <InfoRow
                        label="接收光功率"
                        value={formatNumberWithUnit(item.rx_power, item.rx_power_unit)}
                      />
                      <InfoRow
                        label="发送光功率"
                        value={formatNumberWithUnit(item.tx_power, item.tx_power_unit)}
                      />
                      <InfoRow
                        label="工作电压"
                        value={formatNumberWithUnit(item.voltage, item.voltage_unit)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <SimpleModal open={isOpen} onClose={onClose} title="设备详情" size="4xl">
      {renderContent()}
    </SimpleModal>
  )
}
