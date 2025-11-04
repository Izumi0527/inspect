'use client'

import React from 'react'
import { SimpleModal } from '@/components/atoms'
import { DeviceForm, DeviceFormData } from './DeviceForm'
import { Device } from '../types'

// 数据映射转换函数
const mapFormDataToDevice = (formData: DeviceFormData) => {
  // 根据设备类型推断厂商
  const vendorMap: Record<string, string> = {
    'switch': 'cisco',
    'router': 'cisco',
    'firewall': 'fortinet',
    'wireless_ap': 'cisco'
  }

  return {
    name: formData.name,
    ip: formData.ip,  // 前端兼容字段
    ip_address: formData.ip,  // 后端API字段
    device_type: formData.device_type,
    vendor: vendorMap[formData.device_type] || 'other',  // 添加厂商字段
    location: formData.location || '',
    description: formData.description || '',
    // 正确映射SNMP配置
    snmp_community: formData.snmp_config?.v2c_config?.community || 'public',
    snmp_version: formData.snmp_config?.version || '2c',
    // 正确映射SSH/Telnet配置
    ssh_username: formData.cli_protocol === 'ssh'
      ? formData.ssh_config?.username || ''
      : formData.cli_protocol === 'telnet'
        ? formData.telnet_config?.username || ''
        : formData.ssh_username || '',
    ssh_password: formData.cli_protocol === 'ssh'
      ? formData.ssh_config?.password || ''
      : formData.cli_protocol === 'telnet'
        ? formData.telnet_config?.password || ''
        : formData.ssh_password || ''
  }
}

interface AddDeviceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Omit<Device, 'id' | 'status' | 'last_seen' | 'uptime' | 'cpu_usage' | 'memory_usage' | 'network_traffic' | 'alert_count' | 'created_at' | 'updated_at'>) => Promise<void>
  loading?: boolean
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}) => {
  return (
    <SimpleModal
      open={isOpen}
      onClose={onClose}
      title="添加设备"
      size="5xl"
    >
      <DeviceForm
        onSubmit={async (formData) => {
          // 使用转换函数将表单数据映射为后端期望的格式
          const deviceData = mapFormDataToDevice(formData)
          await onSubmit(deviceData)
          onClose()
        }}
        onCancel={onClose}
        loading={loading}
      />
    </SimpleModal>
  )
}