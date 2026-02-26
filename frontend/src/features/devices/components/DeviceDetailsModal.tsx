'use client'

import React from 'react'
import { SimpleModal, Badge } from '@/components/atoms'
import { Device } from '../types'
import { formatDate } from '@/utils/formatters'
import { getDeviceTypeLabel } from './DeviceIcon'

// 格式化百分比值
const formatPercentageValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null) {
    return '0.0%'
  }
  // 如果值在 0-1 之间（小数格式），转换为百分比
  if (value >= 0 && value < 1) {
    return `${(value * 100).toFixed(1)}%`
  }
  // 如果值在 1-100 之间（已经是百分比），直接使用
  return `${value.toFixed(1)}%`
}

// 格式化最近在线时间
const formatLastSeen = (lastSeen: string | undefined | null): string => {
  if (!lastSeen) {
    return '未知'
  }
  return formatDate(lastSeen, 'datetime')
}

const getCliConfiguration = (device: Device) => {
  const tags = (device.tags ?? {}) as Record<string, any>
  const cliConfig = tags.cli_config ?? {}

  // 优先使用后端顶层字段，其次从 tags 中读取
  const protocol = device.cli_protocol || (cliConfig.cli_protocol as string) || 'none'
  const telnetConfig = device.telnet_config || (cliConfig.telnet_config as Record<string, any>)
  const sshConfig = device.ssh_config || (cliConfig.ssh_config as Record<string, any>)

  const protocolLabel =
    protocol === 'ssh' ? 'SSH' :
    protocol === 'telnet' ? 'Telnet' :
    '未使用 CLI'

  if (protocol === 'ssh') {
    const username = device.ssh_username || sshConfig?.username
    const port = sshConfig?.port || device.ssh_config?.port || device.ssh_port || 22
    return {
      protocolLabel,
      username: username || '未配置',
      port: port ?? 22,
      password: (device.ssh_password || sshConfig?.password) ? '******' : '未配置'
    }
  }

  if (protocol === 'telnet') {
    const username = telnetConfig?.username || '未配置'
    const port = telnetConfig?.port ?? 23
    const password = telnetConfig?.password ? '******' : '未配置'
    const enable = telnetConfig?.enable_password ? '******' : '未配置'
    return {
      protocolLabel,
      username,
      port,
      password,
      enable
    }
  }

  return {
    protocolLabel,
    username: '未使用 CLI',
    port: '-',
    password: '未使用 CLI'
  }
}

interface DeviceDetailsModalProps {
  isOpen: boolean
  device: Device | null
  loading: boolean
  onClose: () => void
}

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col">
    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">{value ?? '-'}</span>
  </div>
)

export const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({
  isOpen,
  device,
  loading,
  onClose
}) => {
  const renderContent = () => {
    if (loading) {
      return <div className="py-10 text-center text-gray-500 dark:text-gray-400">正在加载设备信息...</div>
    }

    if (!device) {
      return <div className="py-10 text-center text-gray-500 dark:text-gray-400">未找到设备信息</div>
    }

    const cliInfo = getCliConfiguration(device)
    const snmpRead = device.snmp_config?.v2c_config?.community ?? device.snmp_community ?? '未配置'
    const snmpWrite = device.snmp_config?.v2c_config?.write_community ?? '未配置'

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl font-semibold">
            {device.name?.slice(0, 2)?.toUpperCase() || 'NA'}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{device.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{device.description || '未填写描述'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="设备类型" value={getDeviceTypeLabel(device.device_type)} />
          <InfoRow label="运行状态" value={<Badge variant="outline">{device.status}</Badge>} />
          <InfoRow label="IP 地址" value={device.ip} />
          <InfoRow label="所在位置" value={device.location || '未设置'} />
          <InfoRow label="CPU 使用率" value={formatPercentageValue(device.cpu_usage)} />
          <InfoRow label="内存使用率" value={formatPercentageValue(device.memory_usage)} />
          <InfoRow label="最近在线时间" value={formatLastSeen(device.last_seen)} />
          <InfoRow label="累计告警" value={device.alert_count ?? 0} />
        </div>

        <div className="border rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">连接配置</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400">
            <InfoRow label="SNMP 只读团体字" value={snmpRead} />
            <InfoRow label="SNMP 读写团体字" value={snmpWrite} />
            <InfoRow label="连接协议" value={cliInfo.protocolLabel} />
            <InfoRow label="CLI 用户名" value={cliInfo.username} />
            <InfoRow label="CLI 密码" value={cliInfo.password} />
            <InfoRow label="CLI 端口" value={cliInfo.port} />
            {cliInfo.enable && <InfoRow label="Enable 密码" value={cliInfo.enable} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <SimpleModal open={isOpen} onClose={onClose} title="设备详情" size="3xl">
      {renderContent()}
    </SimpleModal>
  )
}
